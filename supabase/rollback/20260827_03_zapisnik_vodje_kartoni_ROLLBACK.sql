-- POVRATEK za 20260827_03_zapisnik_vodje_kartoni.sql
--
-- Ni del rednega zaporedja migracij. Pognati ROČNO v Supabase SQL editorju.
--
-- POZOR: to izbriše VSE kartone, vse dodelitve vodij in vse opombe ter
-- pripombe, vpisane v zapisnike. Tega ni mogoče razveljaviti.
--
-- Kartoni so lahko podlaga za suspenz. Pred zagonom jih izvozi:
--   select c.*, r.fixture_id from public.match_cards c
--   join public.league_match_results r on r.id = c.match_result_id;
--
-- In vodje:
--   select league_team_id, user_id, license_date, license_place
--   from public.team_leaders;
--
-- Po tem zapisnik javi napako pri branju vodij in kartonov, dokler ni
-- odstranjena tudi koda (src/pages/admin/LeagueMatchScoresheet.tsx).

drop table if exists public.match_cards;
drop table if exists public.team_leaders;

alter table public.league_match_results
  drop column if exists home_leader_id,
  drop column if exists away_leader_id,
  drop column if exists notes,
  drop column if exists objections;
