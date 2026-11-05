-- Povratek 20261105_01: vrne ligaške admin politike na `for all`.
--
-- POZOR: s tem se vrne tudi vzrok izčrpavanja diskovnega V/I — politika
-- `for all` pokriva SELECT in pri vsakem javnem branju vrednoti korelirano
-- podpoizvedbo. Uporabi le, če se izkaže, da razbitje na insert/update/delete
-- komu odvzame pravico, ki jo je prej imel.

drop policy if exists "Ligaski admin vstavlja ekipe" on public.league_teams;
drop policy if exists "Ligaski admin ureja ekipe" on public.league_teams;
drop policy if exists "Ligaski admin brise ekipe" on public.league_teams;
create policy "Ligaski admin upravlja ekipe" on public.league_teams
  for all to authenticated
  using (public.is_league_admin(season_id)) with check (public.is_league_admin(season_id));

drop policy if exists "Ligaski admin vstavlja tekme" on public.league_fixtures;
drop policy if exists "Ligaski admin ureja tekme" on public.league_fixtures;
drop policy if exists "Ligaski admin brise tekme" on public.league_fixtures;
create policy "Ligaski admin upravlja tekme" on public.league_fixtures
  for all to authenticated
  using (public.is_league_admin(season_id)) with check (public.is_league_admin(season_id));

drop policy if exists "Ligaski admin vstavlja discipline" on public.league_season_disciplines;
drop policy if exists "Ligaski admin ureja discipline" on public.league_season_disciplines;
drop policy if exists "Ligaski admin brise discipline" on public.league_season_disciplines;
create policy "Ligaski admin upravlja discipline" on public.league_season_disciplines
  for all to authenticated
  using (public.is_league_admin(season_id)) with check (public.is_league_admin(season_id));

drop policy if exists "Ligaski admin vstavlja igralce ekip" on public.league_team_players;
drop policy if exists "Ligaski admin ureja igralce ekip" on public.league_team_players;
drop policy if exists "Ligaski admin brise igralce ekip" on public.league_team_players;
create policy "Ligaski admin upravlja igralce ekip" on public.league_team_players
  for all to authenticated
  using (exists (select 1 from public.league_teams t
                  where t.id = league_team_players.league_team_id and public.is_league_admin(t.season_id)))
  with check (exists (select 1 from public.league_teams t
                       where t.id = league_team_players.league_team_id and public.is_league_admin(t.season_id)));

drop policy if exists "Ligaski admin vstavlja zapisnike" on public.league_match_results;
drop policy if exists "Ligaski admin ureja zapisnike" on public.league_match_results;
drop policy if exists "Ligaski admin brise zapisnike" on public.league_match_results;
create policy "Ligaski admin upravlja zapisnike" on public.league_match_results
  for all to authenticated
  using (exists (select 1 from public.league_fixtures f
                  where f.id = league_match_results.fixture_id and public.is_league_admin(f.season_id)))
  with check (exists (select 1 from public.league_fixtures f
                       where f.id = league_match_results.fixture_id and public.is_league_admin(f.season_id)));

drop policy if exists "Ligaski admin vstavlja discipline zapisnika" on public.league_match_discipline_results;
drop policy if exists "Ligaski admin ureja discipline zapisnika" on public.league_match_discipline_results;
drop policy if exists "Ligaski admin brise discipline zapisnika" on public.league_match_discipline_results;
create policy "Ligaski admin upravlja discipline zapisnika" on public.league_match_discipline_results
  for all to authenticated
  using (exists (select 1 from public.league_match_results r
                   join public.league_fixtures f on f.id = r.fixture_id
                  where r.id = league_match_discipline_results.match_result_id
                    and public.is_league_admin(f.season_id)))
  with check (exists (select 1 from public.league_match_results r
                        join public.league_fixtures f on f.id = r.fixture_id
                       where r.id = league_match_discipline_results.match_result_id
                         and public.is_league_admin(f.season_id)));

-- ── vodja tekmovanja, vodje ekip, izbijanje, kartoni ────────────────────────
drop policy if exists "Vodja tekmovanja vstavlja tekme" on public.matches;
drop policy if exists "Vodja tekmovanja ureja tekme" on public.matches;
drop policy if exists "Vodja tekmovanja brise tekme" on public.matches;
create policy "Vodja tekmovanja upravlja tekme" on public.matches
  for all using (public.is_tournament_judge(tournament_id))
  with check (public.is_tournament_judge(tournament_id));

drop policy if exists "Vodja tekmovanja vstavlja skupine" on public.tournament_groups;
drop policy if exists "Vodja tekmovanja ureja skupine" on public.tournament_groups;
drop policy if exists "Vodja tekmovanja brise skupine" on public.tournament_groups;
create policy "Vodja tekmovanja upravlja skupine" on public.tournament_groups
  for all using (public.is_tournament_judge(tournament_id))
  with check (public.is_tournament_judge(tournament_id));

drop policy if exists "Vodja tekmovanja vstavlja ekipe skupin" on public.group_teams;
drop policy if exists "Vodja tekmovanja ureja ekipe skupin" on public.group_teams;
drop policy if exists "Vodja tekmovanja brise ekipe skupin" on public.group_teams;
create policy "Vodja tekmovanja upravlja ekipe skupin" on public.group_teams
  for all using (exists (select 1 from public.tournament_groups g
                          where g.id = group_teams.group_id
                            and public.is_tournament_judge(g.tournament_id)))
  with check (exists (select 1 from public.tournament_groups g
                       where g.id = group_teams.group_id
                         and public.is_tournament_judge(g.tournament_id)));

drop policy if exists "Admin vstavlja vodje" on public.team_leaders;
drop policy if exists "Admin ureja vodje" on public.team_leaders;
drop policy if exists "Admin brise vodje" on public.team_leaders;
create policy "Admin upravlja vodje" on public.team_leaders
  for all to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Ligaski admin vstavlja vodje svoje lige" on public.team_leaders;
drop policy if exists "Ligaski admin ureja vodje svoje lige" on public.team_leaders;
drop policy if exists "Ligaski admin brise vodje svoje lige" on public.team_leaders;
create policy "Ligaski admin upravlja vodje svoje lige" on public.team_leaders
  for all to authenticated
  using (exists (select 1 from public.league_teams t
                  where t.id = team_leaders.league_team_id and public.is_league_admin(t.season_id)))
  with check (exists (select 1 from public.league_teams t
                       where t.id = team_leaders.league_team_id and public.is_league_admin(t.season_id)));

drop policy if exists "Admin vstavlja izbijanje" on public.izbijanje_izidi;
drop policy if exists "Admin ureja izbijanje" on public.izbijanje_izidi;
drop policy if exists "Admin brise izbijanje" on public.izbijanje_izidi;
create policy "Admin upravlja izbijanje" on public.izbijanje_izidi
  for all to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Sodnik vstavlja izbijanje" on public.izbijanje_izidi;
drop policy if exists "Sodnik ureja izbijanje" on public.izbijanje_izidi;
drop policy if exists "Sodnik brise izbijanje" on public.izbijanje_izidi;
create policy "Sodnik vpisuje izbijanje" on public.izbijanje_izidi
  for all to authenticated
  using (exists (select 1 from public.tournament_registrations r
                   join public.tournament_groups g on g.tournament_id = r.tournament_id
                  where r.id = izbijanje_izidi.registration_id and g.judge_id = (select auth.uid())))
  with check (exists (select 1 from public.tournament_registrations r
                        join public.tournament_groups g on g.tournament_id = r.tournament_id
                       where r.id = izbijanje_izidi.registration_id and g.judge_id = (select auth.uid())));

drop policy if exists "Vodja tekmovanja vstavlja izbijanje" on public.izbijanje_izidi;
drop policy if exists "Vodja tekmovanja ureja izbijanje" on public.izbijanje_izidi;
drop policy if exists "Vodja tekmovanja brise izbijanje" on public.izbijanje_izidi;
create policy "Vodja tekmovanja vpisuje izbijanje" on public.izbijanje_izidi
  for all to authenticated
  using (exists (select 1 from public.tournament_registrations r
                  where r.id = izbijanje_izidi.registration_id
                    and (select public.is_tournament_judge(r.tournament_id))))
  with check (exists (select 1 from public.tournament_registrations r
                       where r.id = izbijanje_izidi.registration_id
                         and (select public.is_tournament_judge(r.tournament_id))));

drop policy if exists "Admin vstavlja kartone" on public.match_cards;
drop policy if exists "Admin ureja kartone" on public.match_cards;
drop policy if exists "Admin brise kartone" on public.match_cards;
create policy "Admin upravlja kartone" on public.match_cards
  for all to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Glavni sodnik vstavlja kartone" on public.match_cards;
drop policy if exists "Glavni sodnik ureja kartone" on public.match_cards;
drop policy if exists "Glavni sodnik brise kartone" on public.match_cards;
create policy "Glavni sodnik upravlja kartone" on public.match_cards
  for all to authenticated
  using (exists (select 1 from public.league_match_results r
                   join public.league_fixtures f on f.id = r.fixture_id
                  where r.id = match_cards.match_result_id and f.chief_judge_id = (select auth.uid())))
  with check (exists (select 1 from public.league_match_results r
                        join public.league_fixtures f on f.id = r.fixture_id
                       where r.id = match_cards.match_result_id and f.chief_judge_id = (select auth.uid())));

drop policy if exists "Ligaski admin vstavlja kartone" on public.match_cards;
drop policy if exists "Ligaski admin ureja kartone" on public.match_cards;
drop policy if exists "Ligaski admin brise kartone" on public.match_cards;
create policy "Ligaski admin upravlja kartone" on public.match_cards
  for all to authenticated
  using (exists (select 1 from public.league_match_results r
                   join public.league_fixtures f on f.id = r.fixture_id
                  where r.id = match_cards.match_result_id and public.is_league_admin(f.season_id)))
  with check (exists (select 1 from public.league_match_results r
                        join public.league_fixtures f on f.id = r.fixture_id
                       where r.id = match_cards.match_result_id and public.is_league_admin(f.season_id)));
