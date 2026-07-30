-- POVRATEK za 20260729_06_perf_rls_initplan.sql
--
-- Ni del rednega zaporedja migracij. Pognati ROČNO v Supabase SQL editorju,
-- če se po uvedbi P2 karkoli obnaša narobe — predvsem, če sodnik ne more
-- vpisati zapisnika.
--
-- Vsebina je dobesedni prepis produkcijskega stanja z dne 2026-07-29
-- (`select tablename, policyname, cmd, qual, with_check from pg_policies`),
-- torej vrne politike točno takšne, kot so bile pred P2. Vrne tudi tiste,
-- ki jih repozitorij prej ni poznal (sodniške in tournament_registrations).
--
-- Po zagonu preveri, da ni ostala nobena nova politika:
--   select tablename, policyname from pg_policies
--   where schemaname='public'
--     and policyname in ('Admin vstavljanje','Admin brisanje')
--   order by tablename;      -- pričakovano: prazno
--
-- Javne bralne politike (`for select using (true)`) P2 ne spreminja, zato jih
-- ta datoteka ne obnavlja.

-- ─────────────────────────────────────────────────────────────
-- 1) Odstrani politike, ki jih je ustvaril P2
-- ─────────────────────────────────────────────────────────────
do $$
declare
  tbl text;
  tables constant text[] := array[
    'clubs','double_registrations','group_teams','guest_players','league_fixtures',
    'league_match_discipline_results','league_match_results','league_season_disciplines',
    'league_seasons','league_team_players','league_teams','matches','player_statistics',
    'tournament_groups','tournament_series','tournaments'
  ];
begin
  foreach tbl in array tables loop
    execute format('drop policy if exists "Admin vstavljanje" on public.%I', tbl);
    execute format('drop policy if exists "Admin urejanje" on public.%I', tbl);
    execute format('drop policy if exists "Admin brisanje" on public.%I', tbl);
  end loop;
end $$;

drop policy if exists "Glavni sodnik vstavi zapisnik"     on public.league_match_results;
drop policy if exists "Glavni sodnik posodobi zapisnik"   on public.league_match_results;
drop policy if exists "Glavni sodnik izbriše zapisnik"    on public.league_match_results;
drop policy if exists "Glavni sodnik vstavi discipline"   on public.league_match_discipline_results;
drop policy if exists "Glavni sodnik posodobi discipline" on public.league_match_discipline_results;
drop policy if exists "Glavni sodnik izbriše discipline"  on public.league_match_discipline_results;

-- ─────────────────────────────────────────────────────────────
-- 2) Admin politike `for all` — oblika z IN (11 tabel)
-- ─────────────────────────────────────────────────────────────
do $$
declare
  spec constant text[][] := array[
    ['double_registrations', 'Admin pisanje dvojne registracije'],
    ['group_teams',          'Admin pisanje group_teams'],
    ['league_fixtures',      'Admin pisanje fixtures'],
    ['league_seasons',       'Admin pisanje liga'],
    ['league_team_players',  'Admin pisanje league_team_players'],
    ['league_teams',         'Admin pisanje league_teams'],
    ['matches',              'Admin pisanje matches'],
    ['player_statistics',    'Admin pisanje statistika'],
    ['tournament_groups',    'Admin pisanje skupine'],
    ['tournament_series',    'Admin pisanje serije'],
    ['tournaments',          'Admin pisanje turnirji']
  ];
begin
  for i in 1 .. array_length(spec, 1) loop
    execute format('drop policy if exists %I on public.%I', spec[i][2], spec[i][1]);
    execute format($f$
      create policy %I on public.%I for all using (
        auth.uid() in (select users.id from public.users
                       where users.role = any (array['admin','super_admin']))
      )
    $f$, spec[i][2], spec[i][1]);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 3) Admin politike `for all` — oblika z EXISTS (5 tabel)
-- ─────────────────────────────────────────────────────────────
do $$
declare
  spec constant text[][] := array[
    ['clubs',                           'Admin urejanje'],
    ['league_match_discipline_results', 'Admin write'],
    ['league_match_results',            'Admin write'],
    ['league_season_disciplines',       'Admin write']
  ];
begin
  for i in 1 .. array_length(spec, 1) loop
    execute format('drop policy if exists %I on public.%I', spec[i][2], spec[i][1]);
    execute format($f$
      create policy %I on public.%I for all using (
        exists (select 1 from public.users
                where users.id = auth.uid()
                  and users.role = any (array['admin','super_admin']))
      )
    $f$, spec[i][2], spec[i][1]);
  end loop;
end $$;

-- guest_players je imela tudi WITH CHECK
drop policy if exists "Admin ureja goste" on public.guest_players;
create policy "Admin ureja goste" on public.guest_players for all
  using (exists (select 1 from public.users
                 where users.id = auth.uid()
                   and users.role = any (array['admin','super_admin'])))
  with check (exists (select 1 from public.users
                      where users.id = auth.uid()
                        and users.role = any (array['admin','super_admin'])));

-- ─────────────────────────────────────────────────────────────
-- 4) Sodniške politike — nazaj v izvirno obliko
-- ─────────────────────────────────────────────────────────────
drop policy if exists "Glavni sodnik posodobi svojo tekmo" on public.league_fixtures;
create policy "Glavni sodnik posodobi svojo tekmo" on public.league_fixtures
  for update using (chief_judge_id = auth.uid())
  with check (chief_judge_id = auth.uid());

drop policy if exists "Glavni sodnik piše zapisnik" on public.league_match_results;
create policy "Glavni sodnik piše zapisnik" on public.league_match_results
  for all
  using (exists (select 1 from public.league_fixtures f
                 where f.id = league_match_results.fixture_id
                   and f.chief_judge_id = auth.uid()))
  with check (exists (select 1 from public.league_fixtures f
                      where f.id = league_match_results.fixture_id
                        and f.chief_judge_id = auth.uid()));

drop policy if exists "Glavni sodnik piše discipline" on public.league_match_discipline_results;
create policy "Glavni sodnik piše discipline" on public.league_match_discipline_results
  for all
  using (exists (select 1 from public.league_match_results r
                 join public.league_fixtures f on f.id = r.fixture_id
                 where r.id = league_match_discipline_results.match_result_id
                   and f.chief_judge_id = auth.uid()))
  with check (exists (select 1 from public.league_match_results r
                      join public.league_fixtures f on f.id = r.fixture_id
                      where r.id = league_match_discipline_results.match_result_id
                        and f.chief_judge_id = auth.uid()));

drop policy if exists "Sodnik piše rezultate dodeljene tekme" on public.matches;
create policy "Sodnik piše rezultate dodeljene tekme" on public.matches
  for update using (judge_id = auth.uid())
  with check (judge_id = auth.uid());

drop policy if exists "Sodnik piše rezultate svoje skupine" on public.matches;
create policy "Sodnik piše rezultate svoje skupine" on public.matches
  for update
  using (group_id in (select tournament_groups.id from public.tournament_groups
                      where tournament_groups.judge_id = auth.uid()))
  with check (group_id in (select tournament_groups.id from public.tournament_groups
                           where tournament_groups.judge_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- 5) tournament_registrations in users
-- ─────────────────────────────────────────────────────────────
drop policy if exists "Admin izbriše prijave" on public.tournament_registrations;
create policy "Admin izbriše prijave" on public.tournament_registrations
  for delete using (exists (select 1 from public.users
                            where users.id = auth.uid()
                              and users.role = any (array['admin','super_admin'])));

drop policy if exists "Admin potrdi prijave" on public.tournament_registrations;
create policy "Admin potrdi prijave" on public.tournament_registrations
  for update using (exists (select 1 from public.users
                            where users.id = auth.uid()
                              and users.role = any (array['admin','super_admin'])));

drop policy if exists "admins_can_insert_tournament_registrations" on public.tournament_registrations;
create policy "admins_can_insert_tournament_registrations" on public.tournament_registrations
  for insert to authenticated
  with check (exists (select 1 from public.users
                      where users.id = auth.uid()
                        and users.role = any (array['admin','super_admin'])));

drop policy if exists "Prijava na turnir" on public.tournament_registrations;
create policy "Prijava na turnir" on public.tournament_registrations
  for insert with check (auth.uid() = player1_id);

drop policy if exists "Lastni profil" on public.users;
create policy "Lastni profil" on public.users
  for update using (auth.uid() = id);
