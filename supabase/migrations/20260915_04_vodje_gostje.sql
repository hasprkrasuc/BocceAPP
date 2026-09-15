-- Gostujoči vodja ekipe (ekipni turnirji).
--
-- Vodja tuje reprezentance ni vpisan pri BZS in računa ne bo imel — doslej pa
-- je bil vodja lahko samo registriran uporabnik: team_leaders je imel
-- SESTAVLJEN primarni ključ (league_team_id, user_id), zapisnik pa je vodjo
-- shranil kot uuid s tujim ključem na users.
--
-- team_leaders dobi nadomestni primarni ključ in guest_name (enak vzorec kot
-- league_team_players 20260915_03): vrstica je registriran uporabnik ALI
-- prosto vpisano ime gosta. Unikatnost (ekipa, uporabnik) ohrani delni indeks.
--
-- Vodja v zapisniku (league_match_results.home/away_leader_id) postane
-- besedilo brez tujega ključa: uuid registriranega uporabnika ali prosto ime
-- gosta — ISTA konvencija kot igralci v discipline_results (home_players).
-- Prikaz vodjo vedno razreši prek seznama licenciranih vodij ekipe.

alter table public.team_leaders
  add column if not exists id uuid not null default gen_random_uuid();
alter table public.team_leaders
  drop constraint if exists team_leaders_pkey;
alter table public.team_leaders
  add constraint team_leaders_pkey primary key (id);

alter table public.team_leaders
  alter column user_id drop not null;
alter table public.team_leaders
  add column if not exists guest_name text;

alter table public.team_leaders
  drop constraint if exists team_leaders_uporabnik_ali_gost;
alter table public.team_leaders
  add constraint team_leaders_uporabnik_ali_gost
  check (user_id is not null or (guest_name is not null and btrim(guest_name) <> ''));

create unique index if not exists team_leaders_ekipa_uporabnik
  on public.team_leaders (league_team_id, user_id)
  where user_id is not null;

comment on column public.team_leaders.guest_name is
  'Prosto vpisano ime gostujočega vodje (ekipni turnirji — ni vpisan pri BZS); izključuje se z user_id.';

alter table public.league_match_results
  drop constraint if exists league_match_results_home_leader_id_fkey;
alter table public.league_match_results
  drop constraint if exists league_match_results_away_leader_id_fkey;
alter table public.league_match_results
  alter column home_leader_id type text using home_leader_id::text;
alter table public.league_match_results
  alter column away_leader_id type text using away_leader_id::text;

comment on column public.league_match_results.home_leader_id is
  'Vodja domače ekipe: uuid uporabnika ali prosto ime gosta (ekipni turnirji) — kot igralci v discipline_results.';
comment on column public.league_match_results.away_leader_id is
  'Vodja gostujoče ekipe: uuid uporabnika ali prosto ime gosta (ekipni turnirji).';
