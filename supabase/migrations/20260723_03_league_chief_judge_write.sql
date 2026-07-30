-- Glavni sodnik (league_fixtures.chief_judge_id) lahko vnaša zapisnik svoje
-- ligaške tekme. Aplikacija to že dovoljuje (canEdit = chief judge), a RLS je
-- doslej dovoljeval pisanje le adminom. Dodamo politike za glavnega sodnika.

-- Zapisnik (glava)
create policy "Glavni sodnik piše zapisnik" on league_match_results
  for all to public
  using (exists (select 1 from league_fixtures f where f.id = fixture_id and f.chief_judge_id = auth.uid()))
  with check (exists (select 1 from league_fixtures f where f.id = fixture_id and f.chief_judge_id = auth.uid()));

-- Rezultati po disciplinah (prek match_result_id -> fixture)
create policy "Glavni sodnik piše discipline" on league_match_discipline_results
  for all to public
  using (exists (
    select 1 from league_match_results r
    join league_fixtures f on f.id = r.fixture_id
    where r.id = match_result_id and f.chief_judge_id = auth.uid()))
  with check (exists (
    select 1 from league_match_results r
    join league_fixtures f on f.id = r.fixture_id
    where r.id = match_result_id and f.chief_judge_id = auth.uid()));

-- Posodobitev rezultata/statusa tekme (glavni sodnik ostane isti — brez prevzema)
create policy "Glavni sodnik posodobi svojo tekmo" on league_fixtures
  for update to public
  using (chief_judge_id = auth.uid())
  with check (chief_judge_id = auth.uid());
