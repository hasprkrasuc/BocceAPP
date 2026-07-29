-- Sodnik na posamezni tekmi (predvsem izločilni boji, kjer ni skupinskega sodnika).
-- Dodeljeni sodnik lahko vnaša rezultat te tekme.
alter table matches
  add column if not exists judge_id uuid references users(id) on delete set null;

-- RLS: sodnik lahko ureja rezultat tekme, ki mu je dodeljena (poleg admin in
-- skupinskega sodnika). Velja za katerokoli tekmo (skupinsko ali izločilno).
create policy "Sodnik piše rezultate dodeljene tekme" on matches
  for update to public
  using (judge_id = auth.uid())
  with check (judge_id = auth.uid());
