# Statistika lige — zasnova

**Datum:** 2026-06-28
**Status:** potrjeno (pripravljeno za načrt implementacije)

## Pregled

Vsaka liga (sezona) dobi na svoji strani (`/liga/:id`) lastno **statistiko** in
**rang listo**. Skupna (čez-ligaška) rang lestvica `/rang` ostane nespremenjena.

Vsi računski engini že obstajajo v [`src/engines/leagueStats.ts`](../../../src/engines/leagueStats.ts)
in se **ne spreminjajo**. Funkcionalnost je predvsem povezava enginov v UI,
razrešitev imen igralcev ter dodajanje testov (engini so trenutno netestirani,
`aggregateTeamDisciplineStats` je bila celo mrtva koda).

## Ključne odločitve (potrjeno)

1. **Zavihka.** Stran lige dobi poleg obstoječih (Lestvica · Razpored · Ekipe):
   - **Statistika** — s preklopom med tremi podpogledi:
     - *Posameznik skupno*
     - *Posameznik po disciplinah*
     - *Ekipno po disciplinah*
   - **Rang** — utežena individualna rang lestvica te lige (`calculateRang`).

2. **Stolpci.**

   | Pogled | Stolpci |
   |---|---|
   | Posameznik skupno | Igralec · Klub · Odigrano · **Točke** |
   | Posameznik po disciplinah | *(sekcija na disciplino)* Igralec · Odigrano · **Točke** · *Povprečje¹* |
   | Ekipno po disciplinah | *(sekcija na disciplino)* Ekipa · Odigrano · **Točke** · *Povprečje¹* |
   | Rang | # · Igralec · Klub · **Rang** |

   - **Točke** = match points (0/1/2 seštevek; `matchPointsFor`).
   - **Odigrano** = število odigranih disciplin (`played`).

3. **¹ Povprečje doseženega rezultata** (`scoreFor / played`) se prikaže **samo**
   pri disciplinah: `hitrostno`, `natancno`, `stafeta`, `krog`, `blizanje`,
   `blizanje_krog`. Pri ostalih (posamezno, dvojka, trojka, podaljšek) stolpca ni.

4. **Po disciplinah in ekipno** sta razdeljena v **sekcije po disciplinah** (vsaka
   disciplina svoja tabelica, v vrstnem redu sezonskih disciplin).

5. **Skupni `/rang` ostane nespremenjen.**

## Podatkovni model (obstoječ, brez sprememb)

- `league_match_results` (z gnezdenimi `league_match_discipline_results`):
  `home_score`/`away_score`, `home_match_points`/`away_match_points` (0/1/2),
  `home_players`/`away_players` (nizi: **UUID** iz roster-ja | **"Ime Priimek"** prosti
  vnos | **"R: Ime"** rezerva — izključena iz statistik).
- `league_season_disciplines`: `name`, `discipline_type`, `block_number`, `order_num`.
- Statistike se računajo **sproti** iz zaključenih tekem; nič se ne shranjuje.

## Arhitektura

### Engini (obstoječi, ponovno uporabljeni — brez sprememb)
- `aggregatePlayerStats(matchResults, fixtures, disciplines)` → `PlayerSeasonStat[]`
  (vsebuje `totalPlayed`, `totalMatchPointsFor`, `byDiscipline[]` s `played`,
  `matchPointsFor`, `scoreFor`).
- `aggregateTeamDisciplineStats(teamId, fixtures, matchResults, disciplines)` →
  `TeamDisciplineStat[]` (na ekipo; ima `played`, `matchPointsFor`, `scoreFor`).
- `calculateRang(playerStat, seasonTier)` → `PlayerRangEntry` (`rang`).

### Novi čisti pomožni funkciji (TDD) — `src/engines/leagueStatsViews.ts`
Pretvorita engine-izhode v poglede po disciplinah (pivot + povprečje):

```ts
export const AVERAGE_DISCIPLINES: ReadonlySet<DisciplineType>  // 6 disciplin zgoraj
export function showsAverage(t: DisciplineType): boolean

export interface DisciplinePlayerRow { playerId: string; played: number; matchPointsFor: number; scoreFor: number; average: number }
export function playersByDiscipline(stats: PlayerSeasonStat[], disciplines: LeagueSeasonDiscipline[]):
  { discipline: LeagueSeasonDiscipline; rows: DisciplinePlayerRow[] }[]   // razvrščeno po točkah

export interface DisciplineTeamRow { teamId: string; played: number; matchPointsFor: number; scoreFor: number; average: number }
export function teamsByDiscipline(teamIds: string[], fixtures, matchResults, disciplines):
  { discipline: LeagueSeasonDiscipline; rows: DisciplineTeamRow[] }[]     // kliče aggregateTeamDisciplineStats na ekipo, pivotira
```

`average = played > 0 ? scoreFor / played : 0`.

### Razrešitev imen — `src/lib/playerNames.ts` (DRY)
Izvleče vzorec iz `LeagueRanking.tsx` v ponovno uporabni funkciji:

```ts
export const UUID_RE: RegExp
/** Razreši seznam UUID-ali-imen v zemljevid prikaznih imen + klubov. */
export async function resolvePlayerNames(ids: string[]): Promise<Map<string, { full_name: string; club: string | null }>>
```
(UUID-je poišče v `users` (brez sodnikov), ostalo pusti kot dobesedno ime.)
Uporabi jo nova statistika; refaktor `LeagueRanking.tsx` ni del tega obsega.

### UI — `src/pages/League.tsx` + nova komponenta
- `LeagueDetail.load()` dodatno pridobi `league_match_results` (z gnezdenimi
  discipline rezultati) in `league_season_disciplines`; razreši imena (`resolvePlayerNames`).
- Stanje zavihkov razširjeno: `'standings' | 'fixtures' | 'teams' | 'statistika' | 'rang'`.
- Predstavitev izvlečena v `src/components/LeagueStats.tsx` (sprejme izračunane
  podatke + zemljevid imen), da `League.tsx` ostane pregleden.

## Testiranje

- **Karakterizacijski testi** za obstoječe engine (`aggregatePlayerStats`,
  `aggregateTeamDisciplineStats`, `calculateRang`) — zaklenejo trenutno vedenje;
  če se odkrije hrošč (npr. v dotlej mrtvi `aggregateTeamDisciplineStats`), se popravi.
- **TDD** za novi pomožni funkciji (`playersByDiscipline`, `teamsByDiscipline`,
  `showsAverage`) — vključno s povprečjem in pravilom 6 disciplin.
- UI vizualno na Vercel preview (stran `/liga/:id` je javna).

## Izven obsega (YAGNI)

- Sprememba rang formule / uteži / `LIGA_KOEF`.
- Spreminjanje skupnega `/rang`.
- Refaktor `LeagueRanking.tsx`, da uporabi `resolvePlayerNames` (možno kasneje).
- Shranjevanje statistik (računajo se sproti).
- Admin-urejanje statistik.
