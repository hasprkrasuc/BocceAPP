-- ODBITEK TOČK ZA KAZEN NA LIGAŠKI LESTVICI
--
-- Zveza ekipi zaradi disciplinske kazni odbije točke (neprijava na tekmo,
-- nastop neupravičenega igralca ...). Doslej tega v aplikaciji ni bilo
-- mogoče zapisati — lestvica je poznala samo točke iz odigranih tekem.
--
-- ZAKAJ STOLPEC NA `league_teams` IN NE SVOJA TABELA
--
-- Lestvico računajo tri funkcije v `engines/league.ts` in kličejo jih z
-- OSMIH mest (League.tsx, LeagueAdmin.tsx šestkrat, rangLestvica.ts).
-- Odbitek, podan kot nov neobvezen parameter, bi se tiho izpustil povsod,
-- kjer bi ga kdo pozabil dodati — in prav ta vrsta napake je ta projekt
-- stala časa že večkrat: izračun, ki tiho vrne stare vrednosti, je videti
-- pravilen. `teams` pa se v vse tri funkcije podaja ŽE DANES, zato odbitek
-- na ekipi pride v vsak izračun sam, brez sprememb na klicnih mestih.
--
-- `league_teams` je tudi sama po sebi vezana na eno sezono (vsaka sezona ima
-- svoje vrstice ekip), zato je odbitek s tem samodejno sezonski — kazen iz
-- lanske sezone v novo ne pride.
--
-- PRAVICE se ne spreminjajo: politika "Ligaski admin upravlja ekipe"
-- (is_league_admin(season_id)) že dovoli ligaškemu adminu urejanje svojih
-- ekip, globalnemu adminu pa "Admin urejanje".

alter table public.league_teams
  add column if not exists penalty_points integer not null default 0;

-- Hranimo POZITIVNO število odbitih točk, ne predznačene vrednosti. Tako ni
-- dvoma, v katero smer gre: iz lestvice se vedno odšteje.
alter table public.league_teams
  drop constraint if exists league_teams_penalty_points_check;
alter table public.league_teams
  add constraint league_teams_penalty_points_check
  check (penalty_points >= 0);

comment on column public.league_teams.penalty_points is
  'Število točk, ki se ekipi v tej sezoni ODŠTEJEJO zaradi kazni. 0 = brez kazni. Vedno pozitivno; odšteva engines/league.ts.';

alter table public.league_teams
  add column if not exists penalty_note text;

comment on column public.league_teams.penalty_note is
  'Razlog kazni, kakor se izpiše pod lestvico. Brez njega odbitek na lestvici ni razložen.';
