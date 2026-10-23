-- BZS tekmovalni koledar (uvožen iz KOLEDAR BZS xlsx). Javno berljiv (RLS + select policy).
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  start_date date,
  end_date date,
  month_key text not null,          -- 'YYYY-MM' za grupiranje po mesecih
  category text,
  location text,
  title text not null,
  raw_date text,                    -- izvirni zapis datuma (npr. '10.1.', '10.1. - 11.1.', 'Marec')
  sort_order integer default 0,
  created_at timestamptz default now()
);
create index if not exists calendar_events_start_date_idx on public.calendar_events (start_date);
create index if not exists calendar_events_month_key_idx on public.calendar_events (month_key);

alter table public.calendar_events enable row level security;
drop policy if exists "calendar_events_public_read" on public.calendar_events;
create policy "calendar_events_public_read" on public.calendar_events for select using (true);

-- ─────────────────────────────────────────────────────────────
-- PRAVICE ZA DATA API
--
-- Supabase od 30. 10. 2026 novim tabelam v shemi `public` pravic ne podeli
-- več sam (doslej je to opravil privzetek `alter default privileges`). Brez
-- teh vrstic se migracija izvede BREZ NAPAKE, obnovljena baza pa prek
-- PostgREST na vsako poizvedbo vrne »permission denied«.
--
-- RLS tega ne nadomesti: RLS izbira VRSTICE, grant pa odloča, ali odjemalec
-- tabelo sploh vidi. Vse tabele spodaj imajo RLS vklopljen, zato je obseg
-- enak produkcijskemu (primerjano 23. 10. 2026).
--
-- Na produkciji je to no-op — pravice tam že obstajajo.
-- ─────────────────────────────────────────────────────────────
grant all on public.calendar_events to anon, authenticated, service_role;
