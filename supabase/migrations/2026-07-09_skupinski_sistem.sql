-- Skupinski sistem lig: 2 skupini po 6 → nadaljevalni skupini 1-6 in 7-12.
-- Spec: docs/superpowers/specs/2026-07-09-skupinski-sistem-lig-design.md

-- ─────────────────────────────────────────────────────────────
-- 1) NOVO za skupinski sistem
-- ─────────────────────────────────────────────────────────────

-- Format sezone: 'flat' = raven round robin čez vse ekipe (dosedanje vedenje),
-- 'groups' = 2 skupini po 6 + nadaljevalni skupini. Na izbiro v VSEH ligah.
alter table public.league_seasons
  add column if not exists format text not null default 'flat';

do $$ begin
  alter table public.league_seasons
    add constraint league_seasons_format_check check (format in ('flat', 'groups'));
exception when duplicate_object then null; end $$;

-- Izid žreba: v kateri skupini je ekipa v fazi 1.
-- (Žrebno številko 1–6 znotraj skupine hrani že obstoječi league_teams.draw_number.)
-- Žreb izvede BZS fizično; admin sem vnese le izid.
alter table public.league_teams
  add column if not exists group_label text;

do $$ begin
  alter table public.league_teams
    add constraint league_teams_group_label_check check (group_label in ('A', 'B'));
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────
-- 2) POPRAVEK ZDRSA — stolpci, ki v bazi ŽE obstajajo, a jih nobena
--    migracija ni ustvarila (dodani so bili mimo repozitorija).
--    Brez tega bi svež `00_schema.sql` dal bazo, na kateri se app sesuje.
--    Vse je `if not exists` → na obstoječi bazi so to no-op ukazi.
-- ─────────────────────────────────────────────────────────────

alter table public.league_seasons add column if not exists tier text;
alter table public.league_seasons add column if not exists obz_name text;

alter table public.league_teams add column if not exists draw_number int;

-- group_label na TEKMI je tisti, ki poganja prikaz skupin (League.tsx):
--   NULL     = brez skupin (raven RR)
--   'A'/'B'  = faza 1, skupini
--   '1-6'    = faza 2, nadaljevalna zgornja
--   '7-12'   = faza 2, nadaljevalna spodnja
--   ostalo   = končnica pri mladinskih ligah ('Polfinale', 'Finale', 'Za 3. mesto')
alter table public.league_fixtures add column if not exists group_label text;
alter table public.league_fixtures add column if not exists venue text;
alter table public.league_fixtures add column if not exists scheduled_date date;
alter table public.league_fixtures add column if not exists chief_judge_id uuid references public.users(id);
alter table public.league_fixtures add column if not exists judge_ids uuid[];

-- OPOMBA — še vedno netrackano (izven obsega te naloge, a zabeleženo):
-- tabele `league_match_results`, `league_match_discipline_results` in
-- `league_season_disciplines` obstajajo v živi bazi, a jih nobena migracija
-- ne ustvari. Prav tako stolpci na `users` (emso, club_id, gender, address_*,
-- birth_*, citizenship, photo_url) in cela tabela `clubs`.
-- Dokler to ni urejeno, `supabase/migrations/` ni verodostojen opis baze.
