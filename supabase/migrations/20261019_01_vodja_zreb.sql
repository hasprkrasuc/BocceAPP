-- Vodja tekmovanja sme opraviti žreb svojega tekmovanja.
--
-- Tekmovanju dodeljeni glavni sodnik / vodja (tournaments.chief_judge_id,
-- preverja is_tournament_judge) je doslej smel vpisovati samo izide
-- (matches dodeljene skupine, izbijanje_izidi). Žreb — skupinski, izločilni
-- in žreb v živo (/admin/turnir/:id/zreb) — piše v tournament_groups,
-- group_teams in matches, kjer je pisanje dovoljeval samo admin, zato je
-- vodji na prizorišču žreb padel na RLS.
--
-- Politike dajo vodji poln nadzor nad temi tremi tabelami ZNOTRAJ njegovega
-- tekmovanja; tekmovanja samega (tournaments) še naprej ne more urejati.

drop policy if exists "Vodja tekmovanja upravlja skupine" on public.tournament_groups;
create policy "Vodja tekmovanja upravlja skupine" on public.tournament_groups
  for all
  using (is_tournament_judge(tournament_id))
  with check (is_tournament_judge(tournament_id));

drop policy if exists "Vodja tekmovanja upravlja ekipe skupin" on public.group_teams;
create policy "Vodja tekmovanja upravlja ekipe skupin" on public.group_teams
  for all
  using (exists (
    select 1 from public.tournament_groups g
    where g.id = group_teams.group_id and is_tournament_judge(g.tournament_id)))
  with check (exists (
    select 1 from public.tournament_groups g
    where g.id = group_teams.group_id and is_tournament_judge(g.tournament_id)));

drop policy if exists "Vodja tekmovanja upravlja tekme" on public.matches;
create policy "Vodja tekmovanja upravlja tekme" on public.matches
  for all
  using (is_tournament_judge(tournament_id))
  with check (is_tournament_judge(tournament_id));
