-- Gostujoči/neregistrirani (BZS) ali tuji igralci na turnirjih.
-- Namesto UUID-ja registriranega uporabnika se lahko shrani prosto ime igralca.

alter table tournament_registrations
  add column if not exists player1_name text,
  add column if not exists player2_name text;

-- Gost kot igralec 1 nima UUID-ja → player1_id mora biti lahko NULL.
alter table tournament_registrations
  alter column player1_id drop not null;

-- Vsaj eno od (player1_id, player1_name) mora biti prisotno.
alter table tournament_registrations
  drop constraint if exists tournament_registrations_player1_present;
alter table tournament_registrations
  add constraint tournament_registrations_player1_present
  check (player1_id is not null or player1_name is not null);
