-- EKIPNI TURNIR — enodnevno/kratko tekmovanje ekip oziroma reprezentanc.
--
-- Ekipe igrajo tekme z ISTIM zapisnikom kot ligaške (discipline, punti,
-- točke, kartoni, sodniki), razpored je ENOKROŽNI round robin brez povratnih
-- tekem. Po zgledu pokala (20260831_01) turnir NE dobi svojih tabel, ampak je
-- navadna sezona:
--
--   league_seasons  — ena vrstica s `format = 'turnir'`; `tier` ostane NULL,
--                     ker turnir ni raven državnih lig
--   league_teams    — po ena vrstica na ekipo/reprezentanco (club_id smé biti
--                     NULL — reprezentanca ni klub)
--   league_fixtures — Bergerjev enokrožni razpored, kot v ligi
--
-- KAJ EKIPNI TURNIR NI: ne sodi na seznam državnih lig (svojo kartico ima na
-- strani /turnirji) in NE šteje v rang lestvico — poizvedbi v
-- src/pages/League.tsx in src/lib/rangLestvica.ts ga izpuščata.

alter table public.league_seasons
  drop constraint if exists league_seasons_format_check;

alter table public.league_seasons
  add constraint league_seasons_format_check
  check (format = any (array['flat'::text, 'groups'::text, 'split'::text, 'pokal'::text, 'turnir'::text]));

comment on column public.league_seasons.format is
  'flat/groups/split = ligaški razporedi; pokal = izločilno tekmovanje (league_teams.draw_number je mesto v pajku); turnir = ekipni turnir (enokrožni round robin, tier NULL).';
