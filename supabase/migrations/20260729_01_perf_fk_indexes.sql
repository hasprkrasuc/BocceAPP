-- Zmogljivost: pokrivni indeksi za tuje ključe (Supabase performance advisor).
--
-- Tabele so majhne (največja league_match_discipline_results = 17.683 vrstic,
-- 6 MB), zato migracija teče v sekundah in CONCURRENTLY ni potreben.
--
-- Najbolj vroč je league_match_discipline_results.match_result_id: frontend na
-- treh mestih dela ugnezdeno poizvedbo
--   select("*, discipline_results:league_match_discipline_results(*)")
-- kar brez tega indeksa pomeni sekvenčno branje 17k vrstic za vsak zapisnik.
--
-- OPOMBA o dveh izpuščenih indeksih iz advisorjevega seznama:
-- enostolpčna idx_league_fixtures_season_id in idx_matches_tournament_id NISTA
-- ustvarjena — pokrivata ju sestavljena indeksa na dnu datoteke, ki se začneta
-- z istim stolpcem (Postgres uporabi vodilni stolpec sestavljenega indeksa tudi
-- za preverbe tujih ključev). league_fixtures in matches sta ravno tabeli, v
-- kateri se med tekmovanjem največ piše, zato podvojen indeks na isti dostopni
-- vzorec pomeni dvojno ceno pri vsakem vpisu rezultata brez koristi pri branju.

-- liga / zapisniki (najbolj vroče med tekmovanjem)
create index if not exists idx_lmdr_match_result_id on public.league_match_discipline_results (match_result_id);
create index if not exists idx_lmdr_discipline_id   on public.league_match_discipline_results (discipline_id);
create index if not exists idx_league_fixtures_home_team_id   on public.league_fixtures (home_team_id);
create index if not exists idx_league_fixtures_away_team_id   on public.league_fixtures (away_team_id);
create index if not exists idx_league_fixtures_chief_judge_id on public.league_fixtures (chief_judge_id);
create index if not exists idx_league_season_disciplines_season_id on public.league_season_disciplines (season_id);
create index if not exists idx_league_team_players_player_id       on public.league_team_players (player_id);
create index if not exists idx_league_teams_captain_id             on public.league_teams (captain_id);

-- turnirji
create index if not exists idx_matches_group_id      on public.matches (group_id);
create index if not exists idx_matches_judge_id      on public.matches (judge_id);
create index if not exists idx_matches_team_a_id     on public.matches (team_a_id);
create index if not exists idx_matches_team_b_id     on public.matches (team_b_id);
create index if not exists idx_matches_winner_id     on public.matches (winner_id);
create index if not exists idx_tournament_groups_tournament_id on public.tournament_groups (tournament_id);
create index if not exists idx_tournament_groups_judge_id      on public.tournament_groups (judge_id);
create index if not exists idx_treg_tournament_id     on public.tournament_registrations (tournament_id);
create index if not exists idx_treg_player1_id        on public.tournament_registrations (player1_id);
create index if not exists idx_treg_player2_id        on public.tournament_registrations (player2_id);
create index if not exists idx_treg_player1_guest_id  on public.tournament_registrations (player1_guest_id);
create index if not exists idx_treg_player2_guest_id  on public.tournament_registrations (player2_guest_id);
create index if not exists idx_tournaments_series_id on public.tournaments (series_id);

-- registracije / skupine / ostalo
create index if not exists idx_group_teams_group_id        on public.group_teams (group_id);
create index if not exists idx_group_teams_registration_id on public.group_teams (registration_id);
create index if not exists idx_dreg_primary_team_id   on public.double_registrations (primary_team_id);
create index if not exists idx_dreg_secondary_team_id on public.double_registrations (secondary_team_id);
create index if not exists idx_dreg_resolved_by       on public.double_registrations (resolved_by);
create index if not exists idx_users_club_id on public.users (club_id);

-- sestavljena indeksa za dejanska dostopna vzorca iz frontenda:
--   League.tsx:    .eq('season_id', id).order('round_number')
--   Tournament.tsx: .eq('tournament_id', id) + skupinski pogledi
create index if not exists idx_league_fixtures_season_round on public.league_fixtures (season_id, round_number);
create index if not exists idx_matches_tournament_group     on public.matches (tournament_id, group_id);

analyze;
