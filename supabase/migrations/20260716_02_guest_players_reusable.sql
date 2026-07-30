-- Ponovno uporabni tuji/neregistrirani igralci (stabilen UUID, ni v auth.users).
-- Uporablja se za tekmovanja/serije s tujimi igralci (npr. Youth Adriatic Bocce Cup),
-- kjer mora aplikacija isto osebo prepoznati čez več turnirjev serije.
create table if not exists guest_players (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  club text,
  created_at timestamptz not null default now()
);

alter table guest_players enable row level security;

drop policy if exists "Javno branje gostov" on guest_players;
create policy "Javno branje gostov" on guest_players for select using (true);

drop policy if exists "Admin ureja goste" on guest_players;
create policy "Admin ureja goste" on guest_players for all
  using (exists (select 1 from users where users.id = auth.uid()
                 and users.role = any (array['admin','super_admin'])))
  with check (exists (select 1 from users where users.id = auth.uid()
                 and users.role = any (array['admin','super_admin'])));

grant select on guest_players to anon, authenticated;
grant insert, update, delete on guest_players to authenticated;

-- Reference iz prijav na gosta-igralca (poleg registriranega uporabnika / prostega imena).
alter table tournament_registrations
  add column if not exists player1_guest_id uuid references guest_players(id) on delete set null,
  add column if not exists player2_guest_id uuid references guest_players(id) on delete set null;

-- Igralec 1 je prisoten kot uporabnik, gost-igralec ali prosto ime.
alter table tournament_registrations drop constraint if exists tournament_registrations_player1_present;
alter table tournament_registrations add constraint tournament_registrations_player1_present
  check (player1_id is not null or player1_guest_id is not null or player1_name is not null);
