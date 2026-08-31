-- POKAL BZS — izločilno tekmovanje klubskih ekip.
--
-- ZAKAJ NE NOVE TABELE
--
-- Pokalna tekma se igra z ISTIM zapisnikom kot ligaška — discipline, punti,
-- točke, kartoni, sodniki, podpisi (potrdil lastnik projekta 31. 8. 2026).
-- Zato pokal ne dobi svojih tabel, ampak je navadna sezona:
--
--   league_seasons  — ena vrstica s `format = 'pokal'`
--   league_teams    — po ena vrstica na prijavljeno ekipo; `draw_number` je
--                     žrebana številka in hkrati MESTO V PAJKU (1..64)
--   league_fixtures — po ena vrstica na odigrano tekmo, kot v ligi
--
-- Pajek se ne hrani nikjer: iz žrebanih številk je v celoti izpeljiv (1 igra
-- proti 2, 3 proti 4 …), izračun je v `src/engines/pokal.ts`. Tabela parov bi
-- bila drugi zapis istega podatka in bi se ob prvem popravku žreba razšla.
--
-- ZAKAJ `draw_number` NI UNIKATEN
--
-- Dve ekipi z isto žrebano številko sta v pokalu napaka, a unikatnega indeksa
-- ni mogoče dodati: ligaške sezone v skupinah številčijo od 1 znotraj VSAKE
-- skupine, zato podvojene vrednosti v `league_teams` že obstajajo (npr. sezone
-- 923f0e20, 55eb525e, e77f8fb3). Delni indeks tega ne reši, ker pogoj indeksa
-- ne sme brati druge tabele. Napako zato ujame motor — `pariPrvegaKroga()`
-- vrže `Žrebana številka N je dodeljena dvakrat` — in ima test.
--
-- KAJ POKAL NI
--
-- Pokalna sezona NE sodi na lestvico državnih lig ne v rang lestvico: `tier`
-- ostane NULL, ker tekmovanje združuje Super ligo, 1. in 2. ligo ter območne
-- lige, izračun ranga pa je vezan na eno raven. Poizvedbi v `src/pages/League.tsx`
-- in `src/lib/rangLestvica.ts` pokalne sezone izpuščata.

alter table public.league_seasons
  drop constraint if exists league_seasons_format_check;

alter table public.league_seasons
  add constraint league_seasons_format_check
  check (format = any (array['flat'::text, 'groups'::text, 'split'::text, 'pokal'::text]));

comment on column public.league_seasons.format is
  'flat/groups/split = ligaški razporedi; pokal = izločilno tekmovanje, kjer je league_teams.draw_number mesto v pajku.';

-- Iskanje ekip po mestu v pajku (stran pokala bere vse ekipe sezone).
create index if not exists idx_league_teams_season_draw
  on public.league_teams (season_id, draw_number)
  where draw_number is not null;
