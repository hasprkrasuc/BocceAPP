-- Zmogljivost RLS: 147 opozoril performance advisorja (auth_rls_initplan +
-- multiple_permissive_policies).
--
-- Dve ločeni težavi na istih vročih tabelah:
--
-- 1) auth.uid() (oz. podpoizvedba na users) se izračuna ZA VSAKO VRSTICO.
--    Pri branju 17k disciplinskih rezultatov je to 17k podpoizvedb. Rešitev:
--    stabilna funkcija is_admin() in obvezen ovoj `(select ...)`, ki Postgresu
--    pove, naj izraz izračuna enkrat kot InitPlan.
--
-- 2) Skoraj vsaka tabela ima admin politiko `for all` IN javno bralno politiko
--    `for select using (true)`. Permisivne politike se OR-ajo, zato mora
--    Postgres ob vsakem SELECT ovrednotiti tudi drago admin podpoizvedbo,
--    čeprav javna politika že vrne true. Rešitev: admin politike NE pokrivajo
--    več SELECT — razbite so na insert/update/delete. Javne bralne politike
--    ostanejo nedotaknjene; za SELECT so edine in so najhitrejša možna pot.
--
-- Vse admin politike dobijo tudi `to authenticated`. Doslej so bile vezane na
-- vlogo `public`, torej so se vrednotile tudi za neprijavljene obiskovalce —
-- nesmiselno delo ob vsakem javnem ogledu lestvice.
--
-- ⚠️ NE POGANJAJ NEPOSREDNO NA PRODUKCIJI. Najprej preview branch + regresijski
-- test pravic (scripts/check-rls-regression.cjs). Napačna politika sodnikom med
-- tekmovanjem onemogoči vnos rezultatov — to je hujše od počasne strani.

-- ─────────────────────────────────────────────────────────────
-- 1) Pomožna funkcija: en izračun na poizvedbo, ne na vrstico
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role = any (array['admin','super_admin'])
  );
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- ─────────────────────────────────────────────────────────────
-- 2) Admin politike `for all` → ločene insert/update/delete
--    Semantika ostane ista: pri izvirnih politikah je bil naveden samo USING,
--    kar Postgres pri INSERT uporabi kot WITH CHECK.
-- ─────────────────────────────────────────────────────────────
do $$
declare
  t record;
  tables constant text[][] := array[
    ['tournaments',                     'Admin pisanje turnirji'],
    ['tournament_groups',               'Admin pisanje skupine'],
    ['group_teams',                     'Admin pisanje group_teams'],
    ['matches',                         'Admin pisanje matches'],
    ['league_seasons',                  'Admin pisanje liga'],
    ['league_teams',                    'Admin pisanje league_teams'],
    ['league_team_players',             'Admin pisanje league_team_players'],
    ['league_fixtures',                 'Admin pisanje fixtures'],
    ['player_statistics',               'Admin pisanje statistika'],
    ['clubs',                           'Admin urejanje'],
    ['league_season_disciplines',       'Admin write'],
    ['league_match_results',            'Admin write'],
    ['league_match_discipline_results', 'Admin write'],
    ['tournament_series',               'Admin pisanje serije'],
    ['guest_players',                   'Admin ureja goste'],
    ['double_registrations',            'Admin pisanje dvojne registracije']
  ];
  tbl text; pol text;
begin
  for i in 1 .. array_length(tables, 1) loop
    tbl := tables[i][1];
    pol := tables[i][2];

    -- Preskoči tabelo, ki je v tej bazi ni (repo in baza se ponekod razhajata).
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = tbl) then
      raise notice 'Preskočeno: tabela % ne obstaja', tbl;
      continue;
    end if;

    execute format('drop policy if exists %I on public.%I', pol, tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_admin_insert', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_admin_update', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_admin_delete', tbl);

    execute format($f$
      create policy %I on public.%I
        for insert to authenticated
        with check ( (select public.is_admin()) )
    $f$, tbl || '_admin_insert', tbl);

    execute format($f$
      create policy %I on public.%I
        for update to authenticated
        using ( (select public.is_admin()) )
        with check ( (select public.is_admin()) )
    $f$, tbl || '_admin_update', tbl);

    execute format($f$
      create policy %I on public.%I
        for delete to authenticated
        using ( (select public.is_admin()) )
    $f$, tbl || '_admin_delete', tbl);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 3) Ne-admin politike iz repozitorija: samo InitPlan ovoj
-- ─────────────────────────────────────────────────────────────
drop policy if exists "Lastni profil" on public.users;
create policy "Lastni profil" on public.users
  for update to authenticated
  using ( id = (select auth.uid()) )
  with check ( id = (select auth.uid()) );

drop policy if exists "Prijava na turnir" on public.tournament_registrations;
create policy "Prijava na turnir" on public.tournament_registrations
  for insert to authenticated
  with check ( player1_id = (select auth.uid()) );

drop policy if exists "Admin izbriše prijave" on public.tournament_registrations;
-- (nadomesti jo tournament_registrations_admin_delete iz koraka 2)

-- ─────────────────────────────────────────────────────────────
-- 4) Politike, ki so nastale mimo repozitorija (sodniške in podobne)
--
--    V repu jih ni — obstajajo samo v produkciji, zato njihovih predikatov TU
--    NE PREPISUJEMO NA PAMET. Namesto tega jih prepišemo mehansko: predikat
--    ostane dobesedno tak, kot je, ovijemo le vsak `auth.uid()` v `(select ...)`.
--    To je izraz z isto vrednostjo, le da ga planer izračuna enkrat.
--
--    Zajame med drugim: "Glavni sodnik piše zapisnik", "Glavni sodnik piše
--    discipline", "Glavni sodnik posodobi svojo tekmo", "Sodnik piše rezultate
--    dodeljene tekme", "Sodnik piše rezultate svoje skupine", "Admin potrdi
--    prijave", "admins_can_insert_tournament_registrations".
-- ─────────────────────────────────────────────────────────────

-- Idempotenten ovoj: že ovite pojavitve (deparse jih izpiše kot
-- "( SELECT auth.uid() AS uid)") pusti pri miru.
create or replace function public.__initplan_wrap(expr text)
returns text language sql immutable as $$
  select case when $1 is null then null else
    replace(
      replace(
        replace($1, '( SELECT auth.uid() AS uid)', '@@WRAPPED@@'),
        'auth.uid()', '(select auth.uid())'),
      '@@WRAPPED@@', '( SELECT auth.uid() AS uid)')
  end
$$;

do $$
declare
  p record;
  new_qual text;
  new_check text;
  role_list text;
  sql text;
begin
  for p in
    select tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (qual like '%auth.uid()%' or with_check like '%auth.uid()%')
      and policyname not like '%_admin_insert'
      and policyname not like '%_admin_update'
      and policyname not like '%_admin_delete'
      and policyname not in ('Lastni profil', 'Prijava na turnir')
  loop
    new_qual  := public.__initplan_wrap(p.qual);
    new_check := public.__initplan_wrap(p.with_check);

    -- Nič ovitega ni ostalo → politika je že optimizirana, pusti jo.
    if new_qual is not distinct from p.qual
       and new_check is not distinct from p.with_check then
      continue;
    end if;

    -- Politika, ki zahteva auth.uid(), za anon nikoli ne more uspeti; pri
    -- pisalnih ukazih jo zato omejimo na authenticated. SELECT politik se ne
    -- dotikamo (javno branje mora ostati javno).
    if p.cmd = 'SELECT' then
      role_list := array_to_string(p.roles, ', ');
    else
      role_list := 'authenticated';
    end if;

    sql := format('create policy %I on public.%I as %s for %s to %s',
                  p.policyname, p.tablename,
                  case when p.permissive = 'PERMISSIVE' then 'permissive' else 'restrictive' end,
                  lower(p.cmd), role_list);
    if new_qual is not null and p.cmd <> 'INSERT' then
      sql := sql || format(' using (%s)', new_qual);
    end if;
    if new_check is not null then
      sql := sql || format(' with check (%s)', new_check);
    elsif p.cmd = 'INSERT' and new_qual is not null then
      -- INSERT pozna samo WITH CHECK; izvirni USING je imel isto vlogo.
      sql := sql || format(' with check (%s)', new_qual);
    end if;

    raise notice 'Prepisujem politiko %.% (%)', p.tablename, p.policyname, p.cmd;
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
    execute sql;
  end loop;
end $$;

drop function if exists public.__initplan_wrap(text);

analyze;
