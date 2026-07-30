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
