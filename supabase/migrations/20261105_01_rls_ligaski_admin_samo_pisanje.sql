-- ZMOGLJIVOST RLS: ligaške admin politike naj ne visijo na branju.
--
-- 4. 11. 2026 je Supabase javil, da projektu poteka proračun za diskovni V/I.
-- Statistika je pokazala enega samega prevladujočega krivca:
--
--   tabela                              zap. branj   prebranih vrstic
--   league_match_discipline_results        302.673      4.201.773.532
--   league_fixtures                        211.847        416.420.468
--   league_team_players                     30.630         42.047.832
--   league_teams                            42.747         13.461.220
--
-- `league_match_discipline_results` meri 7 MB in ima 21.132 vrstic, prebrana
-- pa je bila od začetka do konca skoraj 300.000-krat — povprečno 13.882 vrstic
-- na branje. To je desetkrat več kot vse ostalo skupaj.
--
-- ZAKAJ
--
-- Migracija 20260809_01 je uvedla ligaške admine in pri tem ustvarila politike
-- `for all`. Permisivne politike se OR-ajo, zato `for all` pokriva TUDI SELECT:
-- Postgres je ob vsakem javnem branju vrednotil korelirano podpoizvedbo
--
--   exists (select 1 from league_match_results r
--             join league_fixtures f on f.id = r.fixture_id
--            where r.id = league_match_discipline_results.match_result_id
--              and is_league_admin(f.season_id))
--
-- za vsako vrstico posebej — čeprav javna bralna politika `using (true)` za
-- VSE VLOGE že vrne true in admin politika k branju ne prispeva ničesar.
--
-- TO SMO ŽE REŠILI IN SE JE VRNILO
--
-- Migracija 20260729_06_perf_rls_initplan.sql je deset dni prej odpravila
-- natanko ta vzorec in ga v svoji glavi celo poimenuje: »Politika `for all`
-- pokriva tudi SELECT, zato je Postgres ob vsakem javnem branju vrednotil tudi
-- njen drag predikat.« Navaja isto tabelo: »Pri branju 17k disciplinskih
-- rezultatov je to 17k podpoizvedb.« Naslednja migracija je popravek
-- razveljavila, ker je nove politike napisala po starem vzorcu.
--
-- KAJ TA MIGRACIJA NAREDI
--
-- Vsako politiko `for all` razbije na insert/update/delete. Obseg pravic se NE
-- spremeni: kdor je smel pisati, sme še naprej, in branje je bilo že prej
-- javno. Spremeni se samo to, da SELECT teče skozi javno politiko in ne
-- vrednoti več admin predikata.
--
-- Zakaj ovoj `(select ...)` tu ne pomaga: predikati so KORELIRANI (sklicujejo
-- se na stolpec vrstice, npr. `season_id`), zato jih planer ne more izvesti
-- enkrat kot InitPlan. Pri pisanju to ni težava — pisalni ukazi zadenejo nekaj
-- vrstic, ne 21 tisoč.
--
-- `league_seasons` ni tu: njena politika je že `for update`.

-- ── league_teams ────────────────────────────────────────────────────────────
drop policy if exists "Ligaski admin upravlja ekipe" on public.league_teams;

create policy "Ligaski admin vstavlja ekipe" on public.league_teams
  for insert to authenticated
  with check (public.is_league_admin(season_id));
create policy "Ligaski admin ureja ekipe" on public.league_teams
  for update to authenticated
  using (public.is_league_admin(season_id))
  with check (public.is_league_admin(season_id));
create policy "Ligaski admin brise ekipe" on public.league_teams
  for delete to authenticated
  using (public.is_league_admin(season_id));

-- ── league_fixtures ─────────────────────────────────────────────────────────
drop policy if exists "Ligaski admin upravlja tekme" on public.league_fixtures;

create policy "Ligaski admin vstavlja tekme" on public.league_fixtures
  for insert to authenticated
  with check (public.is_league_admin(season_id));
create policy "Ligaski admin ureja tekme" on public.league_fixtures
  for update to authenticated
  using (public.is_league_admin(season_id))
  with check (public.is_league_admin(season_id));
create policy "Ligaski admin brise tekme" on public.league_fixtures
  for delete to authenticated
  using (public.is_league_admin(season_id));

-- ── league_season_disciplines ───────────────────────────────────────────────
drop policy if exists "Ligaski admin upravlja discipline" on public.league_season_disciplines;

create policy "Ligaski admin vstavlja discipline" on public.league_season_disciplines
  for insert to authenticated
  with check (public.is_league_admin(season_id));
create policy "Ligaski admin ureja discipline" on public.league_season_disciplines
  for update to authenticated
  using (public.is_league_admin(season_id))
  with check (public.is_league_admin(season_id));
create policy "Ligaski admin brise discipline" on public.league_season_disciplines
  for delete to authenticated
  using (public.is_league_admin(season_id));

-- ── league_team_players ─────────────────────────────────────────────────────
drop policy if exists "Ligaski admin upravlja igralce ekip" on public.league_team_players;

create policy "Ligaski admin vstavlja igralce ekip" on public.league_team_players
  for insert to authenticated
  with check (exists (
    select 1 from public.league_teams t
    where t.id = league_team_players.league_team_id and public.is_league_admin(t.season_id)
  ));
create policy "Ligaski admin ureja igralce ekip" on public.league_team_players
  for update to authenticated
  using (exists (
    select 1 from public.league_teams t
    where t.id = league_team_players.league_team_id and public.is_league_admin(t.season_id)
  ))
  with check (exists (
    select 1 from public.league_teams t
    where t.id = league_team_players.league_team_id and public.is_league_admin(t.season_id)
  ));
create policy "Ligaski admin brise igralce ekip" on public.league_team_players
  for delete to authenticated
  using (exists (
    select 1 from public.league_teams t
    where t.id = league_team_players.league_team_id and public.is_league_admin(t.season_id)
  ));

-- ── league_match_results ────────────────────────────────────────────────────
drop policy if exists "Ligaski admin upravlja zapisnike" on public.league_match_results;

create policy "Ligaski admin vstavlja zapisnike" on public.league_match_results
  for insert to authenticated
  with check (exists (
    select 1 from public.league_fixtures f
    where f.id = league_match_results.fixture_id and public.is_league_admin(f.season_id)
  ));
create policy "Ligaski admin ureja zapisnike" on public.league_match_results
  for update to authenticated
  using (exists (
    select 1 from public.league_fixtures f
    where f.id = league_match_results.fixture_id and public.is_league_admin(f.season_id)
  ))
  with check (exists (
    select 1 from public.league_fixtures f
    where f.id = league_match_results.fixture_id and public.is_league_admin(f.season_id)
  ));
create policy "Ligaski admin brise zapisnike" on public.league_match_results
  for delete to authenticated
  using (exists (
    select 1 from public.league_fixtures f
    where f.id = league_match_results.fixture_id and public.is_league_admin(f.season_id)
  ));

-- ── league_match_discipline_results ─────────────────────────────────────────
-- Najdražja od vseh: 4,2 milijarde zaporedno prebranih vrstic.
drop policy if exists "Ligaski admin upravlja discipline zapisnika" on public.league_match_discipline_results;

create policy "Ligaski admin vstavlja discipline zapisnika" on public.league_match_discipline_results
  for insert to authenticated
  with check (exists (
    select 1 from public.league_match_results r
    join public.league_fixtures f on f.id = r.fixture_id
    where r.id = league_match_discipline_results.match_result_id and public.is_league_admin(f.season_id)
  ));
create policy "Ligaski admin ureja discipline zapisnika" on public.league_match_discipline_results
  for update to authenticated
  using (exists (
    select 1 from public.league_match_results r
    join public.league_fixtures f on f.id = r.fixture_id
    where r.id = league_match_discipline_results.match_result_id and public.is_league_admin(f.season_id)
  ))
  with check (exists (
    select 1 from public.league_match_results r
    join public.league_fixtures f on f.id = r.fixture_id
    where r.id = league_match_discipline_results.match_result_id and public.is_league_admin(f.season_id)
  ));
create policy "Ligaski admin brise discipline zapisnika" on public.league_match_discipline_results
  for delete to authenticated
  using (exists (
    select 1 from public.league_match_results r
    join public.league_fixtures f on f.id = r.fixture_id
    where r.id = league_match_discipline_results.match_result_id and public.is_league_admin(f.season_id)
  ));

-- ════════════════════════════════════════════════════════════════════════════
-- ISTI VZOREC PRI VODJI TEKMOVANJA, VODJAH EKIP, IZBIJANJU IN KARTONIH
--
-- Popis produkcije je pokazal, da politik `for all` nad javno branimi tabelami
-- ni šest, ampak sedemnajst. Tri od njih veljajo celo za VSE VLOGE (brez `to
-- authenticated`), zato jih Postgres vrednoti tudi neprijavljenemu obiskovalcu:
--
--   matches             172.094 zaporednih branj, 132.577.897 vrstic
--   tournament_groups    77.533                     4.702.101
--   group_teams           7.159                     1.882.405
--
-- Vloge so spodaj ohranjene take, kot so v produkciji: kjer ni `to`, politika
-- velja za vse vloge in tako tudi ostane.
-- ════════════════════════════════════════════════════════════════════════════

-- ── matches ─────────────────────────────────────────────────────────────────
drop policy if exists "Vodja tekmovanja upravlja tekme" on public.matches;

create policy "Vodja tekmovanja vstavlja tekme" on public.matches
  for insert with check (public.is_tournament_judge(tournament_id));
create policy "Vodja tekmovanja ureja tekme" on public.matches
  for update using (public.is_tournament_judge(tournament_id))
  with check (public.is_tournament_judge(tournament_id));
create policy "Vodja tekmovanja brise tekme" on public.matches
  for delete using (public.is_tournament_judge(tournament_id));

-- ── tournament_groups ───────────────────────────────────────────────────────
drop policy if exists "Vodja tekmovanja upravlja skupine" on public.tournament_groups;

create policy "Vodja tekmovanja vstavlja skupine" on public.tournament_groups
  for insert with check (public.is_tournament_judge(tournament_id));
create policy "Vodja tekmovanja ureja skupine" on public.tournament_groups
  for update using (public.is_tournament_judge(tournament_id))
  with check (public.is_tournament_judge(tournament_id));
create policy "Vodja tekmovanja brise skupine" on public.tournament_groups
  for delete using (public.is_tournament_judge(tournament_id));

-- ── group_teams ─────────────────────────────────────────────────────────────
drop policy if exists "Vodja tekmovanja upravlja ekipe skupin" on public.group_teams;

create policy "Vodja tekmovanja vstavlja ekipe skupin" on public.group_teams
  for insert with check (exists (
    select 1 from public.tournament_groups g
    where g.id = group_teams.group_id and public.is_tournament_judge(g.tournament_id)));
create policy "Vodja tekmovanja ureja ekipe skupin" on public.group_teams
  for update using (exists (
    select 1 from public.tournament_groups g
    where g.id = group_teams.group_id and public.is_tournament_judge(g.tournament_id)))
  with check (exists (
    select 1 from public.tournament_groups g
    where g.id = group_teams.group_id and public.is_tournament_judge(g.tournament_id)));
create policy "Vodja tekmovanja brise ekipe skupin" on public.group_teams
  for delete using (exists (
    select 1 from public.tournament_groups g
    where g.id = group_teams.group_id and public.is_tournament_judge(g.tournament_id)));

-- ── team_leaders ────────────────────────────────────────────────────────────
drop policy if exists "Admin upravlja vodje" on public.team_leaders;

create policy "Admin vstavlja vodje" on public.team_leaders
  for insert to authenticated with check ((select public.is_admin()));
create policy "Admin ureja vodje" on public.team_leaders
  for update to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "Admin brise vodje" on public.team_leaders
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists "Ligaski admin upravlja vodje svoje lige" on public.team_leaders;

create policy "Ligaski admin vstavlja vodje svoje lige" on public.team_leaders
  for insert to authenticated with check (exists (
    select 1 from public.league_teams t
    where t.id = team_leaders.league_team_id and public.is_league_admin(t.season_id)));
create policy "Ligaski admin ureja vodje svoje lige" on public.team_leaders
  for update to authenticated using (exists (
    select 1 from public.league_teams t
    where t.id = team_leaders.league_team_id and public.is_league_admin(t.season_id)))
  with check (exists (
    select 1 from public.league_teams t
    where t.id = team_leaders.league_team_id and public.is_league_admin(t.season_id)));
create policy "Ligaski admin brise vodje svoje lige" on public.team_leaders
  for delete to authenticated using (exists (
    select 1 from public.league_teams t
    where t.id = team_leaders.league_team_id and public.is_league_admin(t.season_id)));

-- ── izbijanje_izidi ─────────────────────────────────────────────────────────
drop policy if exists "Admin upravlja izbijanje" on public.izbijanje_izidi;

create policy "Admin vstavlja izbijanje" on public.izbijanje_izidi
  for insert to authenticated with check ((select public.is_admin()));
create policy "Admin ureja izbijanje" on public.izbijanje_izidi
  for update to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "Admin brise izbijanje" on public.izbijanje_izidi
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists "Sodnik vpisuje izbijanje" on public.izbijanje_izidi;

create policy "Sodnik vstavlja izbijanje" on public.izbijanje_izidi
  for insert to authenticated with check (exists (
    select 1 from public.tournament_registrations r
    join public.tournament_groups g on g.tournament_id = r.tournament_id
    where r.id = izbijanje_izidi.registration_id and g.judge_id = (select auth.uid())));
create policy "Sodnik ureja izbijanje" on public.izbijanje_izidi
  for update to authenticated using (exists (
    select 1 from public.tournament_registrations r
    join public.tournament_groups g on g.tournament_id = r.tournament_id
    where r.id = izbijanje_izidi.registration_id and g.judge_id = (select auth.uid())))
  with check (exists (
    select 1 from public.tournament_registrations r
    join public.tournament_groups g on g.tournament_id = r.tournament_id
    where r.id = izbijanje_izidi.registration_id and g.judge_id = (select auth.uid())));
create policy "Sodnik brise izbijanje" on public.izbijanje_izidi
  for delete to authenticated using (exists (
    select 1 from public.tournament_registrations r
    join public.tournament_groups g on g.tournament_id = r.tournament_id
    where r.id = izbijanje_izidi.registration_id and g.judge_id = (select auth.uid())));

drop policy if exists "Vodja tekmovanja vpisuje izbijanje" on public.izbijanje_izidi;

create policy "Vodja tekmovanja vstavlja izbijanje" on public.izbijanje_izidi
  for insert to authenticated with check (exists (
    select 1 from public.tournament_registrations r
    where r.id = izbijanje_izidi.registration_id
      and (select public.is_tournament_judge(r.tournament_id))));
create policy "Vodja tekmovanja ureja izbijanje" on public.izbijanje_izidi
  for update to authenticated using (exists (
    select 1 from public.tournament_registrations r
    where r.id = izbijanje_izidi.registration_id
      and (select public.is_tournament_judge(r.tournament_id))))
  with check (exists (
    select 1 from public.tournament_registrations r
    where r.id = izbijanje_izidi.registration_id
      and (select public.is_tournament_judge(r.tournament_id))));
create policy "Vodja tekmovanja brise izbijanje" on public.izbijanje_izidi
  for delete to authenticated using (exists (
    select 1 from public.tournament_registrations r
    where r.id = izbijanje_izidi.registration_id
      and (select public.is_tournament_judge(r.tournament_id))));

-- ── match_cards ─────────────────────────────────────────────────────────────
drop policy if exists "Admin upravlja kartone" on public.match_cards;

create policy "Admin vstavlja kartone" on public.match_cards
  for insert to authenticated with check ((select public.is_admin()));
create policy "Admin ureja kartone" on public.match_cards
  for update to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "Admin brise kartone" on public.match_cards
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists "Glavni sodnik upravlja kartone" on public.match_cards;

create policy "Glavni sodnik vstavlja kartone" on public.match_cards
  for insert to authenticated with check (exists (
    select 1 from public.league_match_results r
    join public.league_fixtures f on f.id = r.fixture_id
    where r.id = match_cards.match_result_id and f.chief_judge_id = (select auth.uid())));
create policy "Glavni sodnik ureja kartone" on public.match_cards
  for update to authenticated using (exists (
    select 1 from public.league_match_results r
    join public.league_fixtures f on f.id = r.fixture_id
    where r.id = match_cards.match_result_id and f.chief_judge_id = (select auth.uid())))
  with check (exists (
    select 1 from public.league_match_results r
    join public.league_fixtures f on f.id = r.fixture_id
    where r.id = match_cards.match_result_id and f.chief_judge_id = (select auth.uid())));
create policy "Glavni sodnik brise kartone" on public.match_cards
  for delete to authenticated using (exists (
    select 1 from public.league_match_results r
    join public.league_fixtures f on f.id = r.fixture_id
    where r.id = match_cards.match_result_id and f.chief_judge_id = (select auth.uid())));

drop policy if exists "Ligaski admin upravlja kartone" on public.match_cards;

create policy "Ligaski admin vstavlja kartone" on public.match_cards
  for insert to authenticated with check (exists (
    select 1 from public.league_match_results r
    join public.league_fixtures f on f.id = r.fixture_id
    where r.id = match_cards.match_result_id and public.is_league_admin(f.season_id)));
create policy "Ligaski admin ureja kartone" on public.match_cards
  for update to authenticated using (exists (
    select 1 from public.league_match_results r
    join public.league_fixtures f on f.id = r.fixture_id
    where r.id = match_cards.match_result_id and public.is_league_admin(f.season_id)))
  with check (exists (
    select 1 from public.league_match_results r
    join public.league_fixtures f on f.id = r.fixture_id
    where r.id = match_cards.match_result_id and public.is_league_admin(f.season_id)));
create policy "Ligaski admin brise kartone" on public.match_cards
  for delete to authenticated using (exists (
    select 1 from public.league_match_results r
    join public.league_fixtures f on f.id = r.fixture_id
    where r.id = match_cards.match_result_id and public.is_league_admin(f.season_id)));
