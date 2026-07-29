-- Zmogljivost RLS: 147 opozoril performance advisorja
-- (auth_rls_initplan + multiple_permissive_policies).
--
-- Ta datoteka je bila 2026-07-29 PREPISANA. Prva različica je politike
-- prepisovala programsko iz pg_policies (nadomeščanje `auth.uid()` v besedilu
-- predikata), ker sodniške politike niso obstajale v repozitoriju in njihovih
-- predikatov nismo poznali. Popis produkcijskega stanja (`select ... from
-- pg_policies`) jih je razkril, zato so tu vse politike napisane IZRECNO —
-- deterministično in pregledno, brez prepisovanja nizov ob zagonu.
--
-- Ta migracija hkrati odpravi zdrs shema/baza za politike: doslej je pet
-- sodniških politik in dve na tournament_registrations obstajalo samo v
-- produkciji. Po tej migraciji jih pozna tudi repozitorij, zato jih dobi tudi
-- svež `db reset`.
--
-- Dve težavi, ki ju rešuje:
--
-- 1) auth_rls_initplan — `auth.uid()` oz. podpoizvedba na `users` se izračuna
--    ZA VSAKO VRSTICO. Pri branju 17k disciplinskih rezultatov je to 17k
--    podpoizvedb. Rešitev: stabilna `is_admin()` in obvezen ovoj `(select ...)`,
--    ki ga planer izvede enkrat kot InitPlan.
--
-- 2) multiple_permissive_policies — permisivne politike se OR-ajo. Politika
--    `for all` (admin ali sodnik) pokriva tudi SELECT, zato je Postgres ob
--    vsakem javnem branju vrednotil tudi njen drag predikat, čeprav javna
--    bralna politika `using (true)` že vrne true. Vse take politike so tu
--    razbite na insert/update/delete, tako da SELECT teče samo skozi javno
--    politiko — najhitrejšo možno pot.
--
-- Vse pisalne politike dobijo `to authenticated`. Doslej so bile vezane na
-- vlogo `public`, torej so se vrednotile tudi za neprijavljene obiskovalce.
-- Za predikate, ki zahtevajo `auth.uid()`, je to brez spremembe pomena: anon
-- jih ne more izpolniti.
--
-- Javne bralne politike (`for select using (true)`) ostanejo NEDOTAKNJENE.
--
-- ⚠️ Preveri s `scripts/check-rls-regression.cjs`, preden gre v produkcijo.
--    Najbolj kritična je vrstica "sodnik" — te politike med tekmovanjem
--    dejansko delujejo.

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
--
--    Semantika ostane ista: izvirne politike so imele naveden samo USING
--    (izjema guest_players, ki je imela enak WITH CHECK), Postgres pa USING
--    pri INSERT uporabi kot WITH CHECK.
--
--    Tabeli `calendar_events` in `users` v tem seznamu NAMENOMA nista:
--    admin politike za pisanje danes sploh nimata in ta migracija pravic ne
--    širi. (Da UserAdmin ne more spreminjati tujih vlog, je ločena ugotovitev.)
-- ─────────────────────────────────────────────────────────────
do $$
declare
  spec constant text[][] := array[
    ['clubs',                           'Admin urejanje'],
    ['double_registrations',            'Admin pisanje dvojne registracije'],
    ['group_teams',                     'Admin pisanje group_teams'],
    ['guest_players',                   'Admin ureja goste'],
    ['league_fixtures',                 'Admin pisanje fixtures'],
    ['league_match_discipline_results', 'Admin write'],
    ['league_match_results',            'Admin write'],
    ['league_season_disciplines',       'Admin write'],
    ['league_seasons',                  'Admin pisanje liga'],
    ['league_team_players',             'Admin pisanje league_team_players'],
    ['league_teams',                    'Admin pisanje league_teams'],
    ['matches',                         'Admin pisanje matches'],
    ['player_statistics',               'Admin pisanje statistika'],
    ['tournament_groups',               'Admin pisanje skupine'],
    ['tournament_series',               'Admin pisanje serije'],
    ['tournaments',                     'Admin pisanje turnirji']
  ];
  tbl text; pol text;
begin
  for i in 1 .. array_length(spec, 1) loop
    tbl := spec[i][1];
    pol := spec[i][2];

    execute format('drop policy if exists %I on public.%I', pol, tbl);
    execute format('drop policy if exists %I on public.%I', 'Admin vstavljanje', tbl);
    execute format('drop policy if exists %I on public.%I', 'Admin urejanje', tbl);
    execute format('drop policy if exists %I on public.%I', 'Admin brisanje', tbl);

    execute format($f$
      create policy "Admin vstavljanje" on public.%I
        for insert to authenticated
        with check ( (select public.is_admin()) )
    $f$, tbl);

    execute format($f$
      create policy "Admin urejanje" on public.%I
        for update to authenticated
        using ( (select public.is_admin()) )
        with check ( (select public.is_admin()) )
    $f$, tbl);

    execute format($f$
      create policy "Admin brisanje" on public.%I
        for delete to authenticated
        using ( (select public.is_admin()) )
    $f$, tbl);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 3) Sodniške politike
--
--    Doslej so obstajale SAMO v produkciji (nastale mimo migracij). Tu so
--    zapisane dobesedno, kot so bile, z dvema spremembama: `auth.uid()` je
--    ovit v `(select ...)`, politiki `for all` pa sta razbiti po ukazih, da
--    ne pokrivata več SELECT.
--
--    To so politike, ki med tekmovanjem dejansko delujejo. Predikati so
--    prepisani iz produkcijskega popisa 2026-07-29 in se vsebinsko NE
--    spreminjajo.
-- ─────────────────────────────────────────────────────────────

-- 3a) league_fixtures — glavni sodnik zaključi svojo tekmo (rezultat, status)
drop policy if exists "Glavni sodnik posodobi svojo tekmo" on public.league_fixtures;
create policy "Glavni sodnik posodobi svojo tekmo" on public.league_fixtures
  for update to authenticated
  using      ( chief_judge_id = (select auth.uid()) )
  with check ( chief_judge_id = (select auth.uid()) );

-- 3b) league_match_results — glavni sodnik piše zapisnik svoje tekme
drop policy if exists "Glavni sodnik piše zapisnik" on public.league_match_results;
drop policy if exists "Glavni sodnik vstavi zapisnik" on public.league_match_results;
drop policy if exists "Glavni sodnik posodobi zapisnik" on public.league_match_results;
drop policy if exists "Glavni sodnik izbriše zapisnik" on public.league_match_results;

create policy "Glavni sodnik vstavi zapisnik" on public.league_match_results
  for insert to authenticated
  with check ( exists (
    select 1 from public.league_fixtures f
    where f.id = league_match_results.fixture_id
      and f.chief_judge_id = (select auth.uid())
  ) );

create policy "Glavni sodnik posodobi zapisnik" on public.league_match_results
  for update to authenticated
  using ( exists (
    select 1 from public.league_fixtures f
    where f.id = league_match_results.fixture_id
      and f.chief_judge_id = (select auth.uid())
  ) )
  with check ( exists (
    select 1 from public.league_fixtures f
    where f.id = league_match_results.fixture_id
      and f.chief_judge_id = (select auth.uid())
  ) );

create policy "Glavni sodnik izbriše zapisnik" on public.league_match_results
  for delete to authenticated
  using ( exists (
    select 1 from public.league_fixtures f
    where f.id = league_match_results.fixture_id
      and f.chief_judge_id = (select auth.uid())
  ) );

-- 3c) league_match_discipline_results — glavni sodnik piše discipline.
--     Brisanje je tu nujno: save() v LeagueMatchScoresheet.tsx najprej
--     pobriše obstoječe discipline in jih vpiše znova.
drop policy if exists "Glavni sodnik piše discipline" on public.league_match_discipline_results;
drop policy if exists "Glavni sodnik vstavi discipline" on public.league_match_discipline_results;
drop policy if exists "Glavni sodnik posodobi discipline" on public.league_match_discipline_results;
drop policy if exists "Glavni sodnik izbriše discipline" on public.league_match_discipline_results;

create policy "Glavni sodnik vstavi discipline" on public.league_match_discipline_results
  for insert to authenticated
  with check ( exists (
    select 1 from public.league_match_results r
    join public.league_fixtures f on f.id = r.fixture_id
    where r.id = league_match_discipline_results.match_result_id
      and f.chief_judge_id = (select auth.uid())
  ) );

create policy "Glavni sodnik posodobi discipline" on public.league_match_discipline_results
  for update to authenticated
  using ( exists (
    select 1 from public.league_match_results r
    join public.league_fixtures f on f.id = r.fixture_id
    where r.id = league_match_discipline_results.match_result_id
      and f.chief_judge_id = (select auth.uid())
  ) )
  with check ( exists (
    select 1 from public.league_match_results r
    join public.league_fixtures f on f.id = r.fixture_id
    where r.id = league_match_discipline_results.match_result_id
      and f.chief_judge_id = (select auth.uid())
  ) );

create policy "Glavni sodnik izbriše discipline" on public.league_match_discipline_results
  for delete to authenticated
  using ( exists (
    select 1 from public.league_match_results r
    join public.league_fixtures f on f.id = r.fixture_id
    where r.id = league_match_discipline_results.match_result_id
      and f.chief_judge_id = (select auth.uid())
  ) );

-- 3d) matches — sodnik dodeljene tekme (izločilni boji) in sodnik svoje skupine
drop policy if exists "Sodnik piše rezultate dodeljene tekme" on public.matches;
create policy "Sodnik piše rezultate dodeljene tekme" on public.matches
  for update to authenticated
  using      ( judge_id = (select auth.uid()) )
  with check ( judge_id = (select auth.uid()) );

drop policy if exists "Sodnik piše rezultate svoje skupine" on public.matches;
create policy "Sodnik piše rezultate svoje skupine" on public.matches
  for update to authenticated
  using ( group_id in (
    select g.id from public.tournament_groups g
    where g.judge_id = (select auth.uid())
  ) )
  with check ( group_id in (
    select g.id from public.tournament_groups g
    where g.judge_id = (select auth.uid())
  ) );

-- ─────────────────────────────────────────────────────────────
-- 4) tournament_registrations
--
--    Te politike so že po ukazih (INSERT/UPDATE/DELETE), zato jih ni treba
--    razbijati — dobijo samo InitPlan ovoj in `to authenticated`.
--    Prejšnja različica te datoteke je "Admin izbriše prijave" ODSTRANILA in
--    je ni nadomestila (tabele ni bilo v zanki), kar bi adminom vzelo brisanje
--    prijav. Tu je popravljeno.
-- ─────────────────────────────────────────────────────────────
drop policy if exists "Admin izbriše prijave" on public.tournament_registrations;
create policy "Admin izbriše prijave" on public.tournament_registrations
  for delete to authenticated
  using ( (select public.is_admin()) );

drop policy if exists "Admin potrdi prijave" on public.tournament_registrations;
create policy "Admin potrdi prijave" on public.tournament_registrations
  for update to authenticated
  using ( (select public.is_admin()) );

drop policy if exists "admins_can_insert_tournament_registrations" on public.tournament_registrations;
create policy "admins_can_insert_tournament_registrations" on public.tournament_registrations
  for insert to authenticated
  with check ( (select public.is_admin()) );

drop policy if exists "Prijava na turnir" on public.tournament_registrations;
create policy "Prijava na turnir" on public.tournament_registrations
  for insert to authenticated
  with check ( player1_id = (select auth.uid()) );

-- ─────────────────────────────────────────────────────────────
-- 5) users — samo InitPlan ovoj na obstoječi politiki
--    (WITH CHECK je izrecno naveden; doslej ga ni bilo, kar je pri UPDATE
--     pomensko isto — Postgres v tem primeru uporabi USING tudi za preverbo.)
-- ─────────────────────────────────────────────────────────────
drop policy if exists "Lastni profil" on public.users;
create policy "Lastni profil" on public.users
  for update to authenticated
  using      ( id = (select auth.uid()) )
  with check ( id = (select auth.uid()) );

analyze;
