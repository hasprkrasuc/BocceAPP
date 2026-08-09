-- Admin posamezne lige.
--
-- Doslej je bil dostop do /admin/* vse ali nic: users.role = admin/super_admin
-- prek is_admin(). Kdor je smel urejati eno ligo, je smel urejati vse -- in
-- povrhu se klube, uporabnike in turnirje.
--
-- Ta migracija doda vezavo uporabnik <-> sezona. Ligaski admin sme urejati
-- SVOJO sezono in vse, kar visi na njej (ekipe, igralce ekip, tekme, zapisnike,
-- discipline), ne sme pa ustvarjati ali brisati sezon in se ne dotakne drugih lig.
--
-- VARNOSTNO JEDRO: tabele league_season_admins ligaski admin NE sme spreminjati.
-- Ce bi jo smel, bi si lahko dodal vrstico za tujo ligo in si sam razsiril
-- dostop. Vpisuje jo lahko samo globalni admin; ligaski admin vidi le svoje
-- vrstice, ker mora aplikacija vedeti, katere lige ureja.

create table if not exists public.league_season_admins (
  season_id  uuid not null references public.league_seasons(id) on delete cascade,
  user_id    uuid not null references public.users(id)          on delete cascade,
  created_at timestamptz not null default now(),
  primary key (season_id, user_id)
);

create index if not exists idx_league_season_admins_user
  on public.league_season_admins(user_id);

comment on table public.league_season_admins is
  'Admin posamezne ligaske sezone. Vpisuje ga lahko samo globalni admin (is_admin).';

alter table public.league_season_admins enable row level security;

drop policy if exists "Admin upravlja ligaske admine" on public.league_season_admins;
create policy "Admin upravlja ligaske admine" on public.league_season_admins
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Svoje ligaske vloge vidi vsak" on public.league_season_admins;
create policy "Svoje ligaske vloge vidi vsak" on public.league_season_admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Ali je prijavljeni uporabnik admin te sezone.
create or replace function public.is_league_admin(p_season_id uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.league_season_admins
    where season_id = p_season_id and user_id = auth.uid()
  );
$$;

revoke execute on function public.is_league_admin(uuid) from public, anon;
grant execute on function public.is_league_admin(uuid) to authenticated;

-- ── Politike ────────────────────────────────────────────────────────────────
-- Dodane so ob obstojece admin politike; PostgreSQL permisivne politike zdruzi
-- z ALI, zato globalnemu adminu nic ne odvzamejo.

-- Sezona: samo UPDATE svoje. Ustvarjanje in brisanje sezon ostane globalnemu adminu.
drop policy if exists "Ligaski admin ureja svojo sezono" on public.league_seasons;
create policy "Ligaski admin ureja svojo sezono" on public.league_seasons
  for update to authenticated
  using (public.is_league_admin(id)) with check (public.is_league_admin(id));

drop policy if exists "Ligaski admin upravlja ekipe" on public.league_teams;
create policy "Ligaski admin upravlja ekipe" on public.league_teams
  for all to authenticated
  using (public.is_league_admin(season_id)) with check (public.is_league_admin(season_id));

drop policy if exists "Ligaski admin upravlja tekme" on public.league_fixtures;
create policy "Ligaski admin upravlja tekme" on public.league_fixtures
  for all to authenticated
  using (public.is_league_admin(season_id)) with check (public.is_league_admin(season_id));

drop policy if exists "Ligaski admin upravlja discipline" on public.league_season_disciplines;
create policy "Ligaski admin upravlja discipline" on public.league_season_disciplines
  for all to authenticated
  using (public.is_league_admin(season_id)) with check (public.is_league_admin(season_id));

drop policy if exists "Ligaski admin upravlja igralce ekip" on public.league_team_players;
create policy "Ligaski admin upravlja igralce ekip" on public.league_team_players
  for all to authenticated
  using (exists (
    select 1 from public.league_teams t
    where t.id = league_team_players.league_team_id and public.is_league_admin(t.season_id)
  ))
  with check (exists (
    select 1 from public.league_teams t
    where t.id = league_team_players.league_team_id and public.is_league_admin(t.season_id)
  ));

drop policy if exists "Ligaski admin upravlja zapisnike" on public.league_match_results;
create policy "Ligaski admin upravlja zapisnike" on public.league_match_results
  for all to authenticated
  using (exists (
    select 1 from public.league_fixtures f
    where f.id = league_match_results.fixture_id and public.is_league_admin(f.season_id)
  ))
  with check (exists (
    select 1 from public.league_fixtures f
    where f.id = league_match_results.fixture_id and public.is_league_admin(f.season_id)
  ));

drop policy if exists "Ligaski admin upravlja discipline zapisnika" on public.league_match_discipline_results;
create policy "Ligaski admin upravlja discipline zapisnika" on public.league_match_discipline_results
  for all to authenticated
  using (exists (
    select 1 from public.league_match_results r
    join public.league_fixtures f on f.id = r.fixture_id
    where r.id = league_match_discipline_results.match_result_id and public.is_league_admin(f.season_id)
  ))
  with check (exists (
    select 1 from public.league_match_results r
    join public.league_fixtures f on f.id = r.fixture_id
    where r.id = league_match_discipline_results.match_result_id and public.is_league_admin(f.season_id)
  ));
