-- Sodnik lahko vnaša/ureja rezultate tekem v skupini, ki ji je dodeljen
-- (tournament_groups.judge_id = auth.uid()). Poleg obstoječe admin politike.
-- Skupinske tekme imajo group_id; izločilne tekme imajo group_id = NULL, zato
-- jih ta politika ne zajame (te ostanejo v domeni admina).
create policy "Sodnik piše rezultate svoje skupine" on matches
  for update to public
  using (group_id in (select id from tournament_groups where judge_id = auth.uid()))
  with check (group_id in (select id from tournament_groups where judge_id = auth.uid()));
