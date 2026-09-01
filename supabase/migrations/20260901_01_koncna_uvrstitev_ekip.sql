-- Končna uvrstitev ekipe, vnesena ročno, in datum zaključka sezone.
--
-- Rang lestvica podeljuje točke za končno uvrstitev ekipe v Super ligi in
-- Pokalu BZS. Za tekmovanja, katerih tekem aplikacija nima (zgodovinski
-- uvozi — prvi tak je Pokal BZS 2025/26), se uvrstitev ne da izračunati iz
-- tekem, zato jo nosi ekipa sama:
--
--   league_teams.final_rank   ročna končna uvrstitev; prepiše izračunano.
--                             Deljeno mesto je dovoljeno (dve ekipi z rankom
--                             3 = deljeno 3.–4. mesto, kot na DP grafikonih).
--   league_seasons.ended_on   datum zaključka tekmovanja; nadomesti datum
--                             zadnje odigrane tekme pri presoji 365-dnevnega
--                             rang okna, kadar tekem ni.

alter table public.league_teams
  add column if not exists final_rank integer;

alter table public.league_teams
  drop constraint if exists league_teams_final_rank_check;
alter table public.league_teams
  add constraint league_teams_final_rank_check
  check (final_rank is null or final_rank >= 1);

alter table public.league_seasons
  add column if not exists ended_on date;
