-- Varovala za uvoz igralcev (BZS Excel).
-- Koda v api/import-players.ts te podvojitve že lovi, a baza jih doslej dopušča;
-- ti indeksi naredijo podvojitev NEMOGOČO (tudi ob dveh hkratnih uvozih).
--
-- Preverjeno 9.7.2026: obstoječi podatki teh omejitev NE kršijo
--   clubs (case-insens. ime): 0 podvojenih (144 zapisov)
--   league_teams (sezona+klub): 0 podvojenih (187 zapisov)
--   league_team_players (ekipa+igralec): 0 podvojenih (2676 zapisov)

-- Klub: eno ime na klub (neobčutljivo na velike/male črke).
-- Zapre: iskanje kluba z .ilike() bi ob dveh "BK Sava"/"BK SAVA" vrnilo 406 → uvoz bi ustvaril tretji klub.
create unique index if not exists clubs_name_lower_uniq
  on public.clubs (lower(trim(name)));

-- Ligaška ekipa: en klub enkrat na sezono (neobčutljivo na velike/male črke).
-- Zapre: "nova ekipa" ob ponovnem uvozu ne more ustvariti dvojnika istega kluba v isti sezoni.
create unique index if not exists league_teams_season_club_lower_uniq
  on public.league_teams (season_id, lower(trim(club_name)));

-- Roster: igralec je na ekipi največ enkrat.
-- Zapre: check-then-insert ni atomaren; dva hkratna uvoza bi lahko vstavila dvojnik.
create unique index if not exists league_team_players_team_player_uniq
  on public.league_team_players (league_team_id, player_id);

-- OPOMBA — users.emso NAMENOMA še NIMA unique indeksa:
-- 9.7.2026 v bazi obstaja 8 podvojenih EMŠO (16 zapisov), pri 7 sta oba zapisa na
-- rosterju — ista oseba je bila med zgodovinskimi uvozi ustvarjena dvakrat, zato je
-- ligaška pot razcepljena med zapisoma. En primer je celo dvoje RAZLIČNIH oseb z
-- istim EMŠO (eden ima napačno vnesenega).
-- (Konkretni prizadeti zapisi so namenoma NAVEDENI IZVEN repozitorija — gre za
--  osebne podatke, repo pa je javen. Poizvedbo za seznam najdeš v opombi naloge
--  za čiščenje dvojnikov.)
-- Dokler se ti dvojniki ne razrešijo (združitev zapisov + prenos rosterjev), bi
--   create unique index ... on public.users (emso) where emso is not null;
-- spodletel. Po čiščenju ga DODAJ — takrat uvoz ne more več ustvariti dvojnika.
