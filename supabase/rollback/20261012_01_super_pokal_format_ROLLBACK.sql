-- POVRATEK: Super Pokal kot svoj format sezone.
--
-- POZOR: CHECK brez 'super_pokal' se NE uveljavi, dokler v bazi obstaja
-- sezona tega formata. Najprej jo je treba pobrisati ali preklopiti:
--
--   select id, name from league_seasons where format = 'super_pokal';
--
-- Brisanje sezone odnese tudi njene ekipe in tekme (on delete cascade).

alter table public.league_seasons
  drop constraint if exists league_seasons_super_pokal_brez_ranga;

alter table public.league_seasons
  drop constraint if exists league_seasons_format_check;
alter table public.league_seasons
  add constraint league_seasons_format_check
  check (format = any (array['flat'::text, 'groups'::text, 'split'::text,
                             'pokal'::text, 'turnir'::text]));
