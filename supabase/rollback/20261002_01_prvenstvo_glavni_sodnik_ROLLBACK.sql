-- POVRATEK: glavni sodnik / vodja tekmovanja na prvenstvu
--
-- POZOR: povrne tudi politiko "Sodnik vpisuje izbijanje", kakršna je bila v
-- 20260917_01 — torej neizpolnljivo (išče sodnika prek tournament_groups, ki
-- jih pri izbijanju ni). Tako je povratek res povratek v prejšnje stanje in
-- ne tiho izboljšanje.
--
-- Z brisanjem stolpca se izgubi, kdo je bil vodja katerega tekmovanja.

drop policy if exists "Vodja tekmovanja ureja prijave" on public.tournament_registrations;
drop policy if exists "Vodja tekmovanja vpisuje izbijanje" on public.izbijanje_izidi;

create policy "Sodnik vpisuje izbijanje" on public.izbijanje_izidi
  for all to authenticated
  using (exists (
    select 1
      from public.tournament_registrations r
      join public.tournament_groups g on g.tournament_id = r.tournament_id
     where r.id = izbijanje_izidi.registration_id
       and g.judge_id = (select auth.uid())))
  with check (exists (
    select 1
      from public.tournament_registrations r
      join public.tournament_groups g on g.tournament_id = r.tournament_id
     where r.id = izbijanje_izidi.registration_id
       and g.judge_id = (select auth.uid())));

drop function if exists public.is_tournament_judge(uuid);

drop index if exists public.idx_tournaments_chief_judge;

alter table public.tournaments
  drop column if exists chief_judge_id;
