# Bocce App — Navodila za namestitev

## 1. Ustvari Supabase projekt

1. Pojdi na [supabase.com](https://supabase.com) in se registriraj
2. Klikni **New project**
3. Izpolni:
   - **Name**: `bocce-app` (ali poljubno)
   - **Database password**: shrani geslo varno
   - **Region**: izb. najbližjo regijo (npr. Central EU)
4. Počakaj ~2 minuti na inicializacijo

---

## 2. Zaženi SQL shemo

V Supabase pojdi na **SQL Editor** → **New query** in zaženi spodnji SQL.

```sql
-- Omogoči UUID razširitev
create extension if not exists "uuid-ossp";

-- ──────────────────────────────────────
-- ENUMERATORJI
-- ──────────────────────────────────────
create type user_role as enum ('player', 'admin', 'super_admin');
create type tournament_category as enum ('men', 'women', 'u18', 'mixed');
create type group_size_type as enum ('3', '4', '5');
create type tournament_status as enum ('draft', 'registration_open', 'in_progress', 'completed');
create type match_stage as enum ('group', 'r16', 'qf', 'sf', 'final', 'third_place');
create type match_type as enum ('zm', 'po', 'r', 'bye', 'knockout');
create type registration_status as enum ('pending', 'confirmed', 'rejected', 'withdrawn');
create type league_status as enum ('draft', 'active', 'completed');
create type fixture_status as enum ('scheduled', 'completed', 'postponed');

-- ──────────────────────────────────────
-- UPORABNIKI / PLAYERS
-- ──────────────────────────────────────
create table public.users (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text not null,
  phone text,
  date_of_birth date,
  club text,
  license_number text unique,
  role user_role not null default 'player',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.users enable row level security;

create policy "Javni profili so vidni vsem" on public.users
  for select using (true);
create policy "Uporabniki urejajo lasten profil" on public.users
  for update using (auth.uid() = id);
create policy "Admini upravljajo vse profile" on public.users
  for all using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','super_admin'))
  );

-- ──────────────────────────────────────
-- TURNIRJI
-- ──────────────────────────────────────
create table public.tournaments (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  category tournament_category not null,
  date date not null,
  location text not null,
  group_size group_size_type not null default '4',
  max_teams int,
  registration_deadline timestamptz,
  status tournament_status not null default 'draft',
  notes text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
alter table public.tournaments enable row level security;

create policy "Turnirji so javni" on public.tournaments for select using (true);
create policy "Admini upravljajo turnirje" on public.tournaments
  for all using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','super_admin'))
  );

-- ──────────────────────────────────────
-- SKUPINЕ ZNOTRAJ TURNIRJA
-- ──────────────────────────────────────
create table public.tournament_groups (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  group_number int not null,
  venue_name text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique(tournament_id, group_number)
);
alter table public.tournament_groups enable row level security;
create policy "Skupine so javne" on public.tournament_groups for select using (true);
create policy "Admini upravljajo skupine" on public.tournament_groups
  for all using (exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','super_admin')));

-- ──────────────────────────────────────
-- PRIJAVE NA TURNIR
-- ──────────────────────────────────────
create table public.tournament_registrations (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player1_id uuid not null references public.users(id),
  player2_id uuid not null references public.users(id),
  status registration_status not null default 'pending',
  notes text,
  registered_at timestamptz not null default now(),
  constraint different_players check (player1_id != player2_id)
);
alter table public.tournament_registrations enable row level security;

create policy "Vsak vidi svoje prijave" on public.tournament_registrations
  for select using (auth.uid() in (player1_id, player2_id));
create policy "Admini vidijo vse prijave" on public.tournament_registrations
  for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','super_admin')));
create policy "Registrirani se sami prijavijo" on public.tournament_registrations
  for insert with check (auth.uid() in (player1_id, player2_id));
create policy "Admini upravljajo prijave" on public.tournament_registrations
  for all using (exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','super_admin')));

-- ──────────────────────────────────────
-- EKIPE ZNOTRAJ SKUPIN (po žrebu)
-- ──────────────────────────────────────
create table public.group_teams (
  id uuid primary key default uuid_generate_v4(),
  group_id uuid not null references public.tournament_groups(id) on delete cascade,
  registration_id uuid not null references public.tournament_registrations(id),
  seed int not null,
  final_position int,
  eliminated boolean not null default false,
  created_at timestamptz not null default now(),
  unique(group_id, seed)
);
alter table public.group_teams enable row level security;
create policy "Skupinske ekipe so javne" on public.group_teams for select using (true);
create policy "Admini upravljajo skupinske ekipe" on public.group_teams
  for all using (exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','super_admin')));

-- ──────────────────────────────────────
-- TEKME
-- ──────────────────────────────────────
create table public.matches (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  group_id uuid references public.tournament_groups(id),
  stage match_stage not null,
  match_type match_type not null,
  match_number int not null,
  scheduled_time timestamptz,
  court_name text,
  team_a_id uuid references public.group_teams(id),
  team_b_id uuid references public.group_teams(id),
  score_a int,
  score_b int,
  winner_id uuid references public.group_teams(id),
  is_bye boolean not null default false,
  status text not null default 'pending',
  played_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.matches enable row level security;
create policy "Tekme so javne" on public.matches for select using (true);
create policy "Admini upravljajo tekme" on public.matches
  for all using (exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','super_admin')));

-- ──────────────────────────────────────
-- KNOCKOUT BRACKET (čisti knockout del)
-- ──────────────────────────────────────
create table public.knockout_slots (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  stage match_stage not null,
  slot_number int not null,
  match_id uuid references public.matches(id),
  team_id uuid references public.group_teams(id),
  source_group_id uuid references public.tournament_groups(id),
  source_position int,
  created_at timestamptz not null default now(),
  unique(tournament_id, stage, slot_number)
);
alter table public.knockout_slots enable row level security;
create policy "Knockout sloti so javni" on public.knockout_slots for select using (true);
create policy "Admini upravljajo knockout" on public.knockout_slots
  for all using (exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','super_admin')));

-- ──────────────────────────────────────
-- DRŽAVNO EKIPNO PRVENSTVO
-- ──────────────────────────────────────
create table public.league_seasons (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  year int not null,
  category tournament_category not null,
  status league_status not null default 'draft',
  rounds_count int not null default 1,
  win_points int not null default 2,
  draw_points int not null default 1,
  loss_points int not null default 0,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
alter table public.league_seasons enable row level security;
create policy "Sezone so javne" on public.league_seasons for select using (true);
create policy "Admini upravljajo sezone" on public.league_seasons
  for all using (exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','super_admin')));

create table public.league_teams (
  id uuid primary key default uuid_generate_v4(),
  season_id uuid not null references public.league_seasons(id) on delete cascade,
  club_name text not null,
  short_name text,
  captain_id uuid references public.users(id),
  created_at timestamptz not null default now()
);
alter table public.league_teams enable row level security;
create policy "Ligaške ekipe so javne" on public.league_teams for select using (true);
create policy "Admini upravljajo ekipe" on public.league_teams
  for all using (exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','super_admin')));

create table public.league_team_players (
  id uuid primary key default uuid_generate_v4(),
  league_team_id uuid not null references public.league_teams(id) on delete cascade,
  player_id uuid not null references public.users(id),
  jersey_number int,
  created_at timestamptz not null default now(),
  unique(league_team_id, player_id)
);
alter table public.league_team_players enable row level security;
create policy "Sestave so javne" on public.league_team_players for select using (true);
create policy "Admini upravljajo sestave" on public.league_team_players
  for all using (exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','super_admin')));

create table public.league_fixtures (
  id uuid primary key default uuid_generate_v4(),
  season_id uuid not null references public.league_seasons(id) on delete cascade,
  round_number int not null,
  home_team_id uuid not null references public.league_teams(id),
  away_team_id uuid not null references public.league_teams(id),
  scheduled_date date,
  venue text,
  home_score int,
  away_score int,
  status fixture_status not null default 'scheduled',
  notes text,
  created_at timestamptz not null default now()
);
alter table public.league_fixtures enable row level security;
create policy "Tekme lige so javne" on public.league_fixtures for select using (true);
create policy "Admini upravljajo tekme lige" on public.league_fixtures
  for all using (exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','super_admin')));

-- ──────────────────────────────────────
-- STATISTIKA IGRALCEV
-- ──────────────────────────────────────
create table public.player_statistics (
  id uuid primary key default uuid_generate_v4(),
  player_id uuid not null references public.users(id) on delete cascade,
  year int not null,
  tournaments_played int not null default 0,
  matches_won int not null default 0,
  matches_lost int not null default 0,
  points_scored int not null default 0,
  points_conceded int not null default 0,
  group_stage_wins int not null default 0,
  knockout_wins int not null default 0,
  titles int not null default 0,
  podiums int not null default 0,
  updated_at timestamptz not null default now(),
  unique(player_id, year)
);
alter table public.player_statistics enable row level security;
create policy "Statistika je javna" on public.player_statistics for select using (true);
create policy "Admini upravljajo statistiko" on public.player_statistics
  for all using (exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','super_admin')));

-- ──────────────────────────────────────
-- INDEKSI
-- ──────────────────────────────────────
create index on public.matches(tournament_id);
create index on public.matches(group_id);
create index on public.tournament_registrations(tournament_id);
create index on public.tournament_registrations(player1_id);
create index on public.tournament_registrations(player2_id);
create index on public.group_teams(group_id);
create index on public.league_fixtures(season_id, round_number);
create index on public.player_statistics(player_id, year);

-- ──────────────────────────────────────
-- TRIGGER: auto-ustvari profil ob registraciji
-- ──────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'player'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ──────────────────────────────────────
-- PRVIČ: ustvari super_admin (zamenjaj email!)
-- ──────────────────────────────────────
-- Po registraciji v aplikaciji zaženi:
-- UPDATE public.users SET role = 'super_admin' WHERE email = 'tvoj@email.com';
```

---

## 3. Nastavi environment spremenljivke

V korenu projekta ustvari datoteko `.env.local`:

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Vrednosti najdeš v Supabase → **Settings** → **API**.

---

## 4. Namesti in zaženi projekt

```bash
# Namesti odvisnosti
npm install

# Zaženi razvojni strežnik
npm run dev
```

Aplikacija bo dostopna na `http://localhost:5173`

---

## 5. Nastavi prvega administratorja

1. Registriraj se v aplikaciji z emailom
2. V Supabase → **SQL Editor** zaženi:
```sql
UPDATE public.users SET role = 'super_admin' WHERE email = 'tvoj@email.com';
```

---

## 6. Supabase Storage (za avatarje — neobvezno)

V Supabase → **Storage** → **New bucket**:
- Name: `avatars`
- Public: ✓

```sql
-- Dovoli nalaganje avatarjev
create policy "Avatarji so javni" on storage.objects for select using (bucket_id = 'avatars');
create policy "Uporabniki nalagajo lastne avatarje" on storage.objects
  for insert with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
```
