-- POVRATEK za 20260831_01_pokal_format.sql
--
-- Ni del rednega zaporedja migracij. Pognati ROČNO v Supabase SQL editorju.
--
-- POZOR: če pokalna sezona obstaja, jo je treba najprej pobrisati ali ji
-- spremeniti format, sicer CHECK ne bo mogoče postaviti nazaj:
--   select id, name from public.league_seasons where format = 'pokal';

drop index if exists public.idx_league_teams_season_draw;

alter table public.league_seasons
  drop constraint if exists league_seasons_format_check;

alter table public.league_seasons
  add constraint league_seasons_format_check
  check (format = any (array['flat'::text, 'groups'::text, 'split'::text]));
