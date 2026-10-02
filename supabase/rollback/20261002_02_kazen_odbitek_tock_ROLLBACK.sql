-- POVRATEK: odbitek točk za kazen na ligaški lestvici
--
-- Z brisanjem stolpcev se izgubijo vse vpisane kazni in njihovi razlogi.
-- Pred povratkom jih je vredno izvoziti:
--
--   select season_id, club_name, penalty_points, penalty_note
--     from league_teams where penalty_points > 0;

alter table public.league_teams
  drop constraint if exists league_teams_penalty_points_check;

alter table public.league_teams
  drop column if exists penalty_note;

alter table public.league_teams
  drop column if exists penalty_points;
