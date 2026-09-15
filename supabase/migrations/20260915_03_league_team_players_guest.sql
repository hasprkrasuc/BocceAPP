-- Gostujoči igralci v postavah ekip (ekipni turnirji).
--
-- Na ekipnem turnirju (league_seasons.format = 'turnir') igrajo tudi
-- reprezentance s tujimi igralci, ki v registru aplikacije ne obstajajo in
-- ne bodo — zapisnik pa igralce izbira iz postave. Vrstica postave zato
-- lahko namesto povezave na uporabnika nosi prosto vpisano ime gosta:
--
--   player_id  — registriran uporabnik (kot doslej), ALI
--   guest_name — prosto vpisano ime gosta (npr. tuji reprezentant)
--
-- V zapisniku gost nastopa s svojim imenom kot prostim besedilom — enako
-- obliko discipline_results že poznajo (neregistrirani igralci iz uvozov),
-- rang lestvica pa taka imena že obravnava kot tekmovalce brez registra
-- (in ekipnih turnirjev tako ali tako ne šteje).

alter table public.league_team_players
  add column if not exists guest_name text;

alter table public.league_team_players
  alter column player_id drop not null;

alter table public.league_team_players
  drop constraint if exists league_team_players_igralec_ali_gost;
alter table public.league_team_players
  add constraint league_team_players_igralec_ali_gost
  check (player_id is not null or (guest_name is not null and btrim(guest_name) <> ''));

comment on column public.league_team_players.guest_name is
  'Prosto vpisano ime gostujočega igralca (ekipni turnirji — tuji reprezentanti); izključuje se s player_id.';
