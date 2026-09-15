-- Logotip ekipe (npr. zastava reprezentance na ekipnem turnirju).
--
-- Doslej je logotip prihajal IZKLJUČNO iz kluba (clubs.logo_url prek
-- league_teams.club_id). Reprezentance na ekipnih turnirjih (format 'turnir')
-- niso klubi in povezave nimajo — zato ekipa dobi svoj logo_url, ki ima pri
-- prikazu PREDNOST pred klubskim. Slike gredo v obstoječe vedro 'media'
-- (teams/logos/…), tako kot klubski logotipi (clubs/logos/…).
alter table public.league_teams
  add column if not exists logo_url text;

comment on column public.league_teams.logo_url is
  'Logotip/zastava ekipe (reprezentance na ekipnih turnirjih). Pri prikazu ima prednost pred clubs.logo_url.';
