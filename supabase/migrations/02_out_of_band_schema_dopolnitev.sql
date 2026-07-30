-- Dopolnitev zdrsa shema/baza — drugi del.
--
-- `01_out_of_band_schema.sql` je julija dokumentiral štiri tabele in PII stolpce
-- `users`, ki so nastali mimo repozitorija. Ta datoteka zapre preostanek, ki ga
-- je razkrila primerjava produkcijske sheme z migracijami (2026-07-31):
--
--   1) tabela `double_registrations` — v produkciji obstaja in jo aplikacija
--      polno uporablja, a je nobena migracija ne ustvari. Hkrati
--      `20260628_02_security_hardening.sql` in `20260729_*_perf_*` nanjo
--      postavljajo politike in indekse — na sveži bazi bi to padlo z
--      "relation does not exist".
--
--   2) stolpec `tournaments.kind` — loči turnirje od državnih prvenstev
--      (`/turnirji` proti `/prvenstva`, glej App.tsx in `.eq('kind', kind)`).
--      V nobeni migraciji ga ni.
--
-- Datoteka je poimenovana `02_`, da se uvrsti takoj za obe izhodiščni in PRED
-- vse datirane migracije — tudi pri abecednem razvrščanju, ki je v tem
-- repozitoriju drugačno od kronološkega.
--
-- Na produkciji ne spremeni ničesar: vse je `if not exists`. Namen je, da
-- `db reset` iz migracij sploh steče.

-- ─────────────────────────────────────────────────────────────
-- 1) double_registrations
--
--    Definicija je povzeta po produkciji (stolpci in tuji ključi prek
--    PostgREST introspekcije) in po `src/types.ts`:
--      DoubleRegStatus = 'pending' | 'approved' | 'rejected'
--    RLS politike zanjo so v 20260628_02_security_hardening.sql (javno branje +
--    admin pisanje), indeksi pa v 20260729_01_perf_fk_indexes.sql.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.double_registrations (
  id                uuid primary key default gen_random_uuid(),
  player_id         uuid not null references public.users(id) on delete cascade,
  primary_team_id   uuid not null references public.league_teams(id) on delete cascade,
  secondary_team_id uuid not null references public.league_teams(id) on delete cascade,
  season_id         uuid references public.league_seasons(id) on delete cascade,
  status            text not null default 'pending'
                      check (status = any (array['pending','approved','rejected'])),
  requested_at      timestamptz not null default now(),
  resolved_at       timestamptz,
  resolved_by       uuid references public.users(id),
  notes             text
);

alter table public.double_registrations enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 2) tournaments.kind
--
--    Privzetek 'tournament' je prebran iz produkcije; dovoljeni vrednosti sta
--    'tournament' in 'championship' (TournamentKind v src/types.ts).
-- ─────────────────────────────────────────────────────────────
alter table public.tournaments
  add column if not exists kind text not null default 'tournament';

do $$ begin
  alter table public.tournaments add constraint tournaments_kind_check
    check (kind = any (array['tournament','championship']));
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────
-- 3) league_fixtures.chief_judge_id
--
--    Tudi ta stolpec je nastal mimo repozitorija. Edini, ki ga v migracijah
--    ustvari, je 20260709_03_skupinski_sistem.sql — a 20260704_01_chief_judge_fk.sql
--    (pet dni PREJ po imenu) njegov tuji ključ dropa BREZ `if exists` in ga
--    znova ustvari z `on delete set null`. Na sveži bazi bi torej 4. julij padel
--    z "constraint does not exist", ker stolpca takrat še ne bi bilo.
--
--    Ker je stolpec v produkciji obstajal pred obema datotekama, sodi sem —
--    med izhodiščno dokumentacijo, ne v datirano migracijo. S tem je zaporedje
--    po datumih spet veljavno in nobene datoteke ni treba datirati narobe.
--
--    `add column ... references` ustvari omejitev league_fixtures_chief_judge_id_fkey,
--    ki jo 20260704_01 nato prezida na `on delete set null`.
-- ─────────────────────────────────────────────────────────────
alter table public.league_fixtures
  add column if not exists chief_judge_id uuid references public.users(id);

-- ─────────────────────────────────────────────────────────────
-- Preverba po zagonu (pričakovano: obe vrstici)
--
--   select table_name from information_schema.tables
--   where table_schema = 'public' and table_name = 'double_registrations';
--
--   select column_name, column_default from information_schema.columns
--   where table_schema = 'public' and table_name = 'tournaments'
--     and column_name = 'kind';
-- ─────────────────────────────────────────────────────────────
