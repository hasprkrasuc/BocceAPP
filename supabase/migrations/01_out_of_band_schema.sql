-- ═══════════════════════════════════════════════════════════════════════
-- POPRAVEK ZDRSA SHEMA/BAZA
-- ═══════════════════════════════════════════════════════════════════════
-- Te tabele in stolpci obstajajo v ŽIVI bazi, a jih nobena migracija ni
-- ustvarila (dodani so bili mimo repozitorija — prek Supabase UI/SQL Editorja).
-- Brez tega bi svež `supabase db reset` dal bazo, na kateri se aplikacija sesuje,
-- iz repa pa baze ne bi bilo mogoče obnoviti.
--
-- Ime "01_" → teče takoj za 00_schema.sql (osnovne tabele) in PRED vsemi
-- datiranimi migracijami, ki te objekte že uporabljajo (npr.
-- 2026-07-09_import_unique_constraints.sql indeksira clubs; skupinski_sistem
-- FK-a na league_seasons ipd.).
--
-- Definicija izvožena iz žive baze 9.7.2026 (information_schema + pg_catalog).
-- Vse je idempotentno → na obstoječi (produkcijski) bazi je NO-OP.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1) clubs — brez zunanjih FK; ustvari prvo (users.club_id kaže nanjo)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.clubs (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  short_name     text,
  city           text,
  founded_year   integer,
  contact_name   text,
  contact_email  text,
  contact_phone  text,
  website        text,
  logo_url       text,
  team_photo_url text,
  notes          text,
  created_at     timestamptz default now(),
  tier           text
);
alter table public.clubs enable row level security;
drop policy if exists "Javni ogled" on public.clubs;
create policy "Javni ogled" on public.clubs for select using (true);
drop policy if exists "Admin urejanje" on public.clubs;
create policy "Admin urejanje" on public.clubs for all using (
  exists (select 1 from public.users where users.id = auth.uid()
          and users.role = any (array['admin','super_admin']))
);

-- ─────────────────────────────────────────────────────────────
-- 2) league_season_disciplines — FK na league_seasons (00_schema)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.league_season_disciplines (
  id               uuid primary key default gen_random_uuid(),
  season_id        uuid not null references public.league_seasons(id) on delete cascade,
  name             text not null,
  discipline_type  text not null check (discipline_type = any (array[
                     'trojka','dvojka','posamezno','krog','hitrostno','natancno',
                     'blizanje','blizanje_krog','stafeta','podaljsek'])),
  players_per_side integer not null default 1,
  has_reserve      boolean not null default false,
  order_num        integer not null,
  block_number     integer not null default 1
);
alter table public.league_season_disciplines enable row level security;
drop policy if exists "Public read" on public.league_season_disciplines;
create policy "Public read" on public.league_season_disciplines for select using (true);
drop policy if exists "Admin write" on public.league_season_disciplines;
create policy "Admin write" on public.league_season_disciplines for all using (
  exists (select 1 from public.users where users.id = auth.uid()
          and users.role = any (array['admin','super_admin']))
);

-- ─────────────────────────────────────────────────────────────
-- 3) league_match_results — FK na league_fixtures (00_schema); en zapisnik na tekmo
-- ─────────────────────────────────────────────────────────────
create table if not exists public.league_match_results (
  id                  uuid primary key default gen_random_uuid(),
  fixture_id          uuid not null unique references public.league_fixtures(id) on delete cascade,
  judges              text,
  chief_judge         text,
  viewers             integer,
  time_end            text,
  created_at          timestamptz default now(),
  draw_natancno_field integer check (draw_natancno_field = any (array[1,4])),
  draw_blok4          jsonb default '{}'::jsonb
);
alter table public.league_match_results enable row level security;
drop policy if exists "Public read" on public.league_match_results;
create policy "Public read" on public.league_match_results for select using (true);
drop policy if exists "Admin write" on public.league_match_results;
create policy "Admin write" on public.league_match_results for all using (
  exists (select 1 from public.users where users.id = auth.uid()
          and users.role = any (array['admin','super_admin']))
);

-- ─────────────────────────────────────────────────────────────
-- 4) league_match_discipline_results — FK na oba zgornja
--    home_players/away_players hranita UUID-je igralcev (ali "R: <id>" za menjavo)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.league_match_discipline_results (
  id                 uuid primary key default gen_random_uuid(),
  match_result_id    uuid not null references public.league_match_results(id) on delete cascade,
  discipline_id      uuid not null references public.league_season_disciplines(id),
  playground_number  integer,
  home_score         integer,
  away_score         integer,
  home_match_points  integer check (home_match_points = any (array[0,1,2])),
  away_match_points  integer check (away_match_points = any (array[0,1,2])),
  home_players       jsonb default '[]'::jsonb,
  away_players       jsonb default '[]'::jsonb
);
alter table public.league_match_discipline_results enable row level security;
drop policy if exists "Public read" on public.league_match_discipline_results;
create policy "Public read" on public.league_match_discipline_results for select using (true);
drop policy if exists "Admin write" on public.league_match_discipline_results;
create policy "Admin write" on public.league_match_discipline_results for all using (
  exists (select 1 from public.users where users.id = auth.uid()
          and users.role = any (array['admin','super_admin']))
);

-- ─────────────────────────────────────────────────────────────
-- 5) users — stolpci in omejitve, dodani mimo repozitorija
--    (osnovna tabela + politiki "Javno branje"/"Lastni profil" so v 00_schema;
--     column-level grant za anon je v 20260628_restrict_users_pii_from_anon.sql)
-- ─────────────────────────────────────────────────────────────
alter table public.users add column if not exists gender          text;
alter table public.users add column if not exists club_id         uuid;
alter table public.users add column if not exists photo_url       text;
alter table public.users add column if not exists emso            text;
alter table public.users add column if not exists birth_city      text;
alter table public.users add column if not exists birth_country   text;
alter table public.users add column if not exists citizenship     text;
alter table public.users add column if not exists address_street  text;
alter table public.users add column if not exists address_house   text;
alter table public.users add column if not exists address_postal  text;
alter table public.users add column if not exists address_country text;
alter table public.users add column if not exists address_city    text;

-- FK club_id → clubs (SET NULL ob brisanju kluba)
do $$ begin
  alter table public.users add constraint users_club_id_fkey
    foreign key (club_id) references public.clubs(id) on delete set null;
exception when duplicate_object then null; end $$;

-- gender ∈ {M, Ž}
do $$ begin
  alter table public.users add constraint users_gender_check
    check (gender = any (array['M','Ž']));
exception when duplicate_object then null; end $$;

-- role: 00_schema dovoli le player/admin/super_admin; živa baza doda 'judge'
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role = any (array['player','admin','super_admin','judge']));

-- OPOMBA: prožilca trg_sync_user_club in trg_prevent_role_escalation NISTA tu —
-- vezana sta na svoji funkciji (2026-07-07_sync_user_club.sql,
-- 20260628_security_hardening.sql), ki tečeta pozneje in ju že ustvarita.
