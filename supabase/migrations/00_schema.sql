-- ============================================================
-- BOCCE APP — Celotna shema baze podatkov
-- Zaženi v Supabase SQL Editor
-- ============================================================

-- Razširi UUID
create extension if not exists "uuid-ossp";

-- ─── UPORABNIKI ───────────────────────────────────────────────
create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  email       text,
  club        text,
  role        text not null default 'player' check (role in ('player','admin','super_admin')),
  phone       text,
  license_number text,
  date_of_birth  text,
  created_at  timestamptz default now()
);

-- Avtomatično ustvari profil ob registraciji
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── TURNIRJI ─────────────────────────────────────────────────
create table public.tournaments (
  id                    uuid primary key default uuid_generate_v4(),
  name                  text not null,
  date                  date not null,
  location              text not null,
  category              text not null check (category in ('men','women','u18','mixed')),
  status                text not null default 'draft' check (status in ('draft','registration_open','in_progress','completed')),
  group_size            int not null default 4 check (group_size in (3,4,5)),
  max_teams             int,
  registration_deadline timestamptz,
  notes                 text,
  created_at            timestamptz default now()
);

-- ─── PRIJAVE NA TURNIR ────────────────────────────────────────
create table public.tournament_registrations (
  id             uuid primary key default uuid_generate_v4(),
  tournament_id  uuid not null references public.tournaments(id) on delete cascade,
  player1_id     uuid not null references public.users(id),
  player2_id     uuid not null references public.users(id),
  status         text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  registered_at  timestamptz default now()
);

-- ─── SKUPINE ──────────────────────────────────────────────────
create table public.tournament_groups (
  id            uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  group_number  int not null,
  status        text not null default 'pending' check (status in ('pending','in_progress','completed')),
  venue_name    text
);

-- ─── EKIPE V SKUPINI ──────────────────────────────────────────
create table public.group_teams (
  id              uuid primary key default uuid_generate_v4(),
  group_id        uuid not null references public.tournament_groups(id) on delete cascade,
  registration_id uuid not null references public.tournament_registrations(id) on delete cascade,
  seed            int not null default 1
);

-- ─── TEKME ────────────────────────────────────────────────────
create table public.matches (
  id            uuid primary key default uuid_generate_v4(),
  tournament_id uuid references public.tournaments(id) on delete cascade,
  group_id      uuid references public.tournament_groups(id) on delete cascade,
  stage         text not null check (stage in ('group','r16','qf','sf','final','third_place')),
  match_type    text not null check (match_type in ('zm','po','r','bye','knockout')),
  match_number  int not null,
  team_a_id     uuid references public.group_teams(id),
  team_b_id     uuid references public.group_teams(id),
  winner_id     uuid references public.group_teams(id),
  score_a       int,
  score_b       int,
  is_bye        boolean not null default false,
  status        text not null default 'pending' check (status in ('pending','completed')),
  played_at     timestamptz,
  created_at    timestamptz default now()
);

-- ─── LIGA — SEZONE ────────────────────────────────────────────
create table public.league_seasons (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  year         int not null,
  category     text not null default 'men' check (category in ('men','women','u18')),
  status       text not null default 'draft' check (status in ('draft','active','completed')),
  rounds_count int not null default 1,
  win_points   int not null default 2,
  draw_points  int not null default 1,
  loss_points  int not null default 0,
  created_at   timestamptz default now()
);

-- ─── LIGA — EKIPE ─────────────────────────────────────────────
create table public.league_teams (
  id         uuid primary key default uuid_generate_v4(),
  season_id  uuid not null references public.league_seasons(id) on delete cascade,
  club_name  text not null,
  short_name text,
  captain_id uuid references public.users(id)
);

-- ─── LIGA — ČLANI EKIP ────────────────────────────────────────
create table public.league_team_players (
  id              uuid primary key default uuid_generate_v4(),
  league_team_id  uuid not null references public.league_teams(id) on delete cascade,
  player_id       uuid not null references public.users(id),
  jersey_number   int
);

-- ─── LIGA — TEKME ─────────────────────────────────────────────
create table public.league_fixtures (
  id             uuid primary key default uuid_generate_v4(),
  season_id      uuid not null references public.league_seasons(id) on delete cascade,
  round_number   int not null,
  home_team_id   uuid not null references public.league_teams(id),
  away_team_id   uuid not null references public.league_teams(id),
  home_score     int,
  away_score     int,
  status         text not null default 'scheduled' check (status in ('scheduled','completed')),
  scheduled_date timestamptz
);

-- ─── STATISTIKA IGRALCEV ──────────────────────────────────────
create table public.player_statistics (
  id                  uuid primary key default uuid_generate_v4(),
  player_id           uuid not null references public.users(id) on delete cascade,
  year                int not null,
  tournaments_played  int not null default 0,
  matches_won         int not null default 0,
  matches_lost        int not null default 0,
  points_scored       int not null default 0,
  titles              int not null default 0,
  podiums             int not null default 0,
  unique (player_id, year)
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────
alter table public.users enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_registrations enable row level security;
alter table public.tournament_groups enable row level security;
alter table public.group_teams enable row level security;
alter table public.matches enable row level security;
alter table public.league_seasons enable row level security;
alter table public.league_teams enable row level security;
alter table public.league_team_players enable row level security;
alter table public.league_fixtures enable row level security;
alter table public.player_statistics enable row level security;

-- Javno branje za vse
create policy "Javno branje" on public.tournaments for select using (true);
create policy "Javno branje" on public.tournament_registrations for select using (true);
create policy "Javno branje" on public.tournament_groups for select using (true);
create policy "Javno branje" on public.group_teams for select using (true);
create policy "Javno branje" on public.matches for select using (true);
create policy "Javno branje" on public.league_seasons for select using (true);
create policy "Javno branje" on public.league_teams for select using (true);
create policy "Javno branje" on public.league_team_players for select using (true);
create policy "Javno branje" on public.league_fixtures for select using (true);
create policy "Javno branje" on public.player_statistics for select using (true);
create policy "Javno branje" on public.users for select using (true);

-- Pisanje samo za admine (service_role ali authenticated z admin vlogo)
create policy "Admin pisanje turnirji" on public.tournaments for all
  using (auth.uid() in (select id from public.users where role in ('admin','super_admin')));

create policy "Admin pisanje skupine" on public.tournament_groups for all
  using (auth.uid() in (select id from public.users where role in ('admin','super_admin')));

create policy "Admin pisanje group_teams" on public.group_teams for all
  using (auth.uid() in (select id from public.users where role in ('admin','super_admin')));

create policy "Admin pisanje matches" on public.matches for all
  using (auth.uid() in (select id from public.users where role in ('admin','super_admin')));

create policy "Admin pisanje liga" on public.league_seasons for all
  using (auth.uid() in (select id from public.users where role in ('admin','super_admin')));

create policy "Admin pisanje league_teams" on public.league_teams for all
  using (auth.uid() in (select id from public.users where role in ('admin','super_admin')));

create policy "Admin pisanje league_team_players" on public.league_team_players for all
  using (auth.uid() in (select id from public.users where role in ('admin','super_admin')));

create policy "Admin pisanje fixtures" on public.league_fixtures for all
  using (auth.uid() in (select id from public.users where role in ('admin','super_admin')));

create policy "Admin pisanje statistika" on public.player_statistics for all
  using (auth.uid() in (select id from public.users where role in ('admin','super_admin')));

-- Uporabnik lahko ureja svoj profil
create policy "Lastni profil" on public.users for update
  using (auth.uid() = id);

-- Prijavljen uporabnik lahko vpiše svojo prijavo
create policy "Prijava na turnir" on public.tournament_registrations for insert
  with check (auth.uid() = player1_id);

-- ─── REALTIME ─────────────────────────────────────────────────
alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.league_fixtures;
