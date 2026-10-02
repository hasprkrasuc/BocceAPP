-- GLAVNI SODNIK / VODJA TEKMOVANJA NA PRVENSTVU
--
-- Izide prvenstva v izbijanju je doslej lahko vpisal samo globalni admin.
-- Na prvenstvu pa rezultate vodi glavni sodnik oziroma vodja tekmovanja in
-- ta ni nujno admin aplikacije — zveza ga ne bo delala za admina samo zato,
-- da lahko vpiše zadetke.
--
-- Vzorec je enak kot pri ligi: `league_season_admins` + `is_league_admin()`
-- dajeta človeku pravice SAMO nad svojo sezono. Tu je oseba ena, zato stolpec
-- in ne vezna tabela — poimenovanje je prevzeto po `league_fixtures.chief_judge_id`,
-- ki v shemi že obstaja.
--
-- ZAKAJ OBSTOJEČA POLITIKA NI ZADOSTOVALA
--
-- Migracija 20260917_01 je ob tabeli `izbijanje_izidi` ustvarila politiko
-- "Sodnik vpisuje izbijanje", ki sodnika poišče prek `tournament_groups.judge_id`.
-- Pri izbijanju skupin NI — prav to je bil razlog za svojo tabelo ("zanje ni
-- ne skupin ne pajka"). Politika zato ni mogla biti nikoli izpolnjena: za
-- vsako vrstico v `izbijanje_izidi` je `tournament_groups` prazen, EXISTS pa
-- neresničen. Videti je bilo, kot da sodniki delujejo, v resnici je vpis
-- ostal pri adminu. Spodaj jo odstranimo in nadomestimo s tako, ki sodnika
-- poišče na prvenstvu samem.

alter table public.tournaments
  add column if not exists chief_judge_id uuid references public.users(id) on delete set null;

comment on column public.tournaments.chief_judge_id is
  'Glavni sodnik oziroma vodja tekmovanja. Sme vpisovati izide in končni vrstni red TEGA prvenstva, tudi če ni admin aplikacije.';

create index if not exists idx_tournaments_chief_judge
  on public.tournaments (chief_judge_id)
  where chief_judge_id is not null;

-- ─── Ali je prijavljeni uporabnik vodja tega tekmovanja ──────────────────────
-- Enaka oblika kot is_league_admin: sql, stable, security definer in izrecen
-- search_path. Brez `set search_path` je funkcija odvisna od klicateljeve
-- nastavitve — to razhajanje smo lovili že pri `sync_user_club`.
create or replace function public.is_tournament_judge(p_tournament_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.tournaments
    where id = p_tournament_id and chief_judge_id = auth.uid()
  );
$$;

comment on function public.is_tournament_judge(uuid) is
  'Ali je prijavljeni uporabnik glavni sodnik / vodja tega tekmovanja.';

-- ─── Izidi izbijanja ─────────────────────────────────────────────────────────
-- Politika prek tournament_groups je bila za to tabelo neizpolnljiva (glej
-- opombo na vrhu). Odstranimo jo, da ne zavaja.
drop policy if exists "Sodnik vpisuje izbijanje" on public.izbijanje_izidi;

drop policy if exists "Vodja tekmovanja vpisuje izbijanje" on public.izbijanje_izidi;
create policy "Vodja tekmovanja vpisuje izbijanje" on public.izbijanje_izidi
  for all to authenticated
  using (exists (
    select 1
      from public.tournament_registrations r
     where r.id = izbijanje_izidi.registration_id
       and (select public.is_tournament_judge(r.tournament_id))))
  with check (exists (
    select 1
      from public.tournament_registrations r
     where r.id = izbijanje_izidi.registration_id
       and (select public.is_tournament_judge(r.tournament_id))));

-- ─── Prijave na prvenstvo ────────────────────────────────────────────────────
-- Vodja tekmovanja potrebuje UPDATE na prijavah SVOJEGA prvenstva, ker tam
-- živita dva podatka, ki ju vodi on:
--
--   final_rank  — končni vrstni red, brez katerega uvrstitve ne pridejo na
--                 rang lestvico (gumb »Zapiši končni vrstni red«)
--   draw_number — žrebana številka, zadnje merilo ob izenačenih izidih
--
-- RLS ne zna omejiti po stolpcih, zato dobi UPDATE nad celo vrstico — a samo
-- nad prijavami na prvenstvo, ki ga vodi. To je v skladu s tem, kar vodja
-- tekmovanja v resnici počne: skrbi za startno listo in za izide.
drop policy if exists "Vodja tekmovanja ureja prijave" on public.tournament_registrations;
create policy "Vodja tekmovanja ureja prijave" on public.tournament_registrations
  for update to authenticated
  using ((select public.is_tournament_judge(tournament_id)))
  with check ((select public.is_tournament_judge(tournament_id)));
