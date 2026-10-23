-- Serija mladinskih turnirjev (sezona)
create table if not exists public.tournament_series (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year int not null,
  category text not null check (category in ('u14','u18')),
  counting_results int,                         -- N najboljših; null = vsi štejejo
  status text not null default 'draft' check (status in ('draft','active','completed')),
  created_at timestamptz not null default now()
);

alter table public.tournaments
  add column if not exists series_id uuid references public.tournament_series(id) on delete set null,
  add column if not exists discipline_type text;

-- Posamezne discipline = 1 igralec na vpis
alter table public.tournament_registrations
  alter column player2_id drop not null;

-- RLS (preslikano po obstoječih tournaments politikah)
alter table public.tournament_series enable row level security;

create policy "Javno branje" on public.tournament_series
  for select using (true);

create policy "Admin pisanje serije" on public.tournament_series
  for all using (
    auth.uid() in (select id from public.users where role = any (array['admin','super_admin']))
  );

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
grant all on public.tournament_series to anon, authenticated, service_role;
