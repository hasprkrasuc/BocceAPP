-- Zapisnik: vodje ekip, opombe, pripombe in kartoni.
--
-- Dosedanji zapisnik je poznal le postave in izide disciplin. Papirnati
-- zapisnik BZS ima poleg tega še vodji obeh ekip, ločena polja za opombe in
-- pripombe ter kartone — in podpise. Ta migracija doda, kar je za to potrebno
-- v bazi; postavitev za tisk s podpisnimi mesti je v zapisniku samem.
--
-- ZAKAJ SO OPOMBE IN PRIPOMBE LOČENI POLJI
--
-- Nista isto in nimata istih posledic. Opomba je sodnikov zapis o poteku
-- (zamuda, dež, okvara igrišča). Pripomba je ugovor ekipe zoper sojenje ali
-- izid in sproži postopek pri zvezi. Če bi ju zlili v eno polje, bi se ugovor
-- izgubil med opažanji in ga nihče ne bi našel.
--
-- ZAKAJ KARTONI V SVOJI TABELI
--
-- Karton se ne pripiše tekmi, ampak OSEBI, in se šteje čez sezono — po treh
-- rumenih sledi suspenz. Kot prosto besedilo v zapisniku bi bili nešteti in
-- neiskani; komisija bi morala brati zapisnike enega za drugim.
--
-- player_id je lahko prazen: karton dobi tudi vodja ekipe ali gost, ki v
-- postavi ne nastopa. Zato hranimo tudi ime — a vsaj eno od obojega mora biti,
-- kar zahteva CHECK. Brez tega bi lahko nastal karton, ki ni od nikogar.
--
-- ZAKAJ SO VODJE VEZANI NA league_teams IN NE NA KLUB
--
-- Vodja je licenciran za ekipo v določenem tekmovanju: isti človek je lahko
-- vodja članske ekipe in ne mladinske. Ker league_teams že visi na sezoni,
-- ki nosi tier in kategorijo, je vezava nanjo natanko to, kar evidenca zveze
-- pove — brez podvajanja podatka o tekmovanju.

-- ── Vodje ekip ──────────────────────────────────────────────────────────────
create table if not exists public.team_leaders (
  league_team_id uuid not null references public.league_teams(id) on delete cascade,
  user_id        uuid not null references public.users(id)        on delete cascade,
  -- Iz evidence zveze; v prejetem izvozu izpolnjena pri 37 od 203 vrstic.
  license_date   date,
  license_place  text,
  created_at     timestamptz not null default now(),
  primary key (league_team_id, user_id)
);

create index if not exists idx_team_leaders_user on public.team_leaders(user_id);

comment on table public.team_leaders is
  'Vodje, licencirani za posamezno ligaško ekipo. Vir je evidenca zveze (evidence.balinanje.si).';

alter table public.team_leaders enable row level security;

-- Branje je javno: spustni seznam v zapisniku ga potrebuje, vsebina pa je le
-- ime človeka in ekipa, kar je tako ali tako javno na zapisniku tekme.
drop policy if exists "Public read" on public.team_leaders;
create policy "Public read" on public.team_leaders for select using (true);

drop policy if exists "Admin upravlja vodje" on public.team_leaders;
create policy "Admin upravlja vodje" on public.team_leaders
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Ligaski admin upravlja vodje svoje lige" on public.team_leaders;
create policy "Ligaski admin upravlja vodje svoje lige" on public.team_leaders
  for all to authenticated
  using (exists (
    select 1 from public.league_teams t
    where t.id = team_leaders.league_team_id and public.is_league_admin(t.season_id)
  ))
  with check (exists (
    select 1 from public.league_teams t
    where t.id = team_leaders.league_team_id and public.is_league_admin(t.season_id)
  ));

-- ── Zapisnik: vodji, opombe, pripombe ───────────────────────────────────────
-- Novi stolpci podedujejo politike league_match_results, zato zanje ni treba
-- dodajati ničesar: kdor sme urejati zapisnik, sme urejati tudi ta polja.
alter table public.league_match_results
  add column if not exists home_leader_id uuid references public.users(id) on delete set null,
  add column if not exists away_leader_id uuid references public.users(id) on delete set null,
  add column if not exists notes      text,
  add column if not exists objections text;

comment on column public.league_match_results.notes is
  'Opombe — sodnikov zapis o poteku tekme (zamuda, vreme, okvara).';
comment on column public.league_match_results.objections is
  'Pripombe — ugovor ekipe zoper sojenje ali izid; sproži postopek pri zvezi.';

create index if not exists idx_lmr_home_leader on public.league_match_results(home_leader_id);
create index if not exists idx_lmr_away_leader on public.league_match_results(away_leader_id);

-- ── Kartoni ─────────────────────────────────────────────────────────────────
create table if not exists public.match_cards (
  id              uuid primary key default gen_random_uuid(),
  match_result_id uuid not null references public.league_match_results(id) on delete cascade,
  -- Kartonirani. Prazen, kadar gre za koga, ki ni v bazi (gost, vodja).
  player_id       uuid references public.users(id) on delete set null,
  player_name     text,
  side            text not null check (side = any (array['home','away'])),
  color           text not null check (color = any (array['rumen','rdec'])),
  reason          text,
  created_at      timestamptz not null default now(),
  -- Karton mora biti od nekoga: brez tega bi lahko nastal zapis brez osebe.
  constraint match_cards_ima_osebo
    check (player_id is not null or coalesce(btrim(player_name), '') <> '')
);

create index if not exists idx_match_cards_result on public.match_cards(match_result_id);
create index if not exists idx_match_cards_player on public.match_cards(player_id);

comment on table public.match_cards is
  'Kartoni s tekme. Ločena tabela, ker se štejejo čez sezono (suspenz po treh rumenih).';

alter table public.match_cards enable row level security;

drop policy if exists "Public read" on public.match_cards;
create policy "Public read" on public.match_cards for select using (true);

drop policy if exists "Admin upravlja kartone" on public.match_cards;
create policy "Admin upravlja kartone" on public.match_cards
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Glavni sodnik tekme — enako kot pri disciplinah zapisnika.
drop policy if exists "Glavni sodnik upravlja kartone" on public.match_cards;
create policy "Glavni sodnik upravlja kartone" on public.match_cards
  for all to authenticated
  using (exists (
    select 1 from public.league_match_results r
    join public.league_fixtures f on f.id = r.fixture_id
    where r.id = match_cards.match_result_id and f.chief_judge_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.league_match_results r
    join public.league_fixtures f on f.id = r.fixture_id
    where r.id = match_cards.match_result_id and f.chief_judge_id = (select auth.uid())
  ));

drop policy if exists "Ligaski admin upravlja kartone" on public.match_cards;
create policy "Ligaski admin upravlja kartone" on public.match_cards
  for all to authenticated
  using (exists (
    select 1 from public.league_match_results r
    join public.league_fixtures f on f.id = r.fixture_id
    where r.id = match_cards.match_result_id and public.is_league_admin(f.season_id)
  ))
  with check (exists (
    select 1 from public.league_match_results r
    join public.league_fixtures f on f.id = r.fixture_id
    where r.id = match_cards.match_result_id and public.is_league_admin(f.season_id)
  ));
