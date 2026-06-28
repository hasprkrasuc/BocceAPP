# Mladinski turnirji — serija (sezona) — zasnova

**Datum:** 2026-06-28
**Status:** potrjeno (pripravljeno za načrt implementacije)

## Pregled

Mladinske kategorije (U14, U18) imajo poleg ligaškega tekmovanja tudi **turnirje**.
Turnirji se igrajo v skupinah z zaključnimi izločilnimi boji (enako kot nagradni
turnirji / državna prvenstva). Vsak turnir podeli igralcem **uvrstitvene točke**,
seštevek čez več turnirjev v isti **seriji (sezoni)** pa določi **skupnega zmagovalca**.

Tekmovanje je **individualno**: vsak igralec tekmuje zase in zbira točke v svoj
osebni seštevek.

## Ključne odločitve (potrjeno z naročnikom)

1. **Vpis / pari.** Vsak turnir se igra v **eni disciplini**.
   - Posamezne discipline (posamezno, hitrostno, natančno, bližanje, bližanje v krog,
     krog) → igralec se prijavi **sam** (1 igralec na vpis).
   - **Dvojka** in **štafeta** → prijavita se **dva**; **oba** dobita uvrstitvene
     točke, vsakemu se štejejo **posebej** v njegov individualni seštevek.

2. **Točkovanje po uvrstitvi.**

   | Mesto | Točke |
   |------:|------:|
   | 1.    | 16 |
   | 2.    | 10 |
   | 3.    | 8 |
   | 4.    | 7 |
   | 5.–8. | 3 |
   | 9.–16.| 1 |

3. **Največ 16 tekmovalcev/ekip na turnir; vsi prejmejo točke.**

4. **Določitev uvrstitve** (po krogu izpada):
   - 1./2. mesto = zmagovalec/poraženec **finala**
   - 3./4. mesto = zmagovalec/poraženec tekme **za 3. mesto**
   - 5.–8. mesto = **poraženci četrtfinala** (vsi 3 točke)
   - 9.–16. mesto = **vsi ostali** (poraženci osmine finala **in** neuvrščeni iz
     skupin), vsi 1 točka. Natančnega vrstnega reda znotraj 9.–16. ni treba računati,
     ker imajo vsi enako vrednost.

5. **Disciplina je lastnost turnirja** — serija vsebuje turnirje v **mešanih**
   disciplinah; skupni zmagovalec je najboljši čez vse discipline skupaj.

6. **Skupni zmagovalec serije = najboljših N od M.** Šteje se le N najboljših
   rezultatov igralca; najslabši se odbijejo. **N je nastavljiv na seriji**
   (`counting_results`; null = štejejo vsi turnirji).

## Arhitektura

Razširitev obstoječega turnirskega modula + tanka plast "serije". Engine za
skupine in izločilne boje ([`src/engines/tournament.ts`](../../../src/engines/tournament.ts))
ter admin za vodenje turnirja (`TournamentEdit`) se **ponovno uporabita**.
Novo je: serija, izračun uvrstitev→točk in lestvica serije (vse čiste funkcije).

### Podatkovni model

**Nova tabela `tournament_series`:**

| stolpec | tip | opis |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | npr. "Mladinska serija U14 2025/26" |
| `year` | int | |
| `category` | text | `u14` \| `u18` |
| `counting_results` | int null | N najboljših rezultatov (null = vsi) |
| `status` | text | `draft` \| `active` \| `completed` |
| `created_at` | timestamptz | |

**`tournaments` — dva nova stolpca:**
- `series_id` uuid null → FK `tournament_series` (null = samostojen turnir)
- `discipline_type` text null — ena disciplina turnirja (`posamezno`, `dvojka`,
  `hitrostno`, `natancno`, `blizanje`, `blizanje_krog`, `krog`, `stafeta`)

**`tournament_registrations`:**
- `player2_id` → **nullable** (posamezne discipline: 1 igralec; dvojka/štafeta: 2)

Uvrstitve in lestvica se **ne shranjujejo** — računajo se sproti iz tekem.
Podatki so majhni (≤16 na turnir, malo turnirjev), zato ni sinhronizacijskih težav.

### Engine `src/engines/tournamentPlacement.ts` (TDD)

Iz zaključenih tekem turnirja izračuna uvrstitev vsake prijave po krogu izpada in
razširi na posameznike (par → oba igralca dobita iste točke).

```ts
export const PLACEMENT_POINTS = { p1: 16, p2: 10, p3: 8, p4: 7, p5_8: 3, p9_16: 1 }

/** Ali se disciplina igra v paru (oba člana točkujeta)? */
export function isPairDiscipline(d: DisciplineType): boolean  // dvojka | stafeta

/** Uvrstitveni "koš" prijave glede na to, kje je izpadla. */
type PlacementBucket = 1 | 2 | 3 | 4 | '5-8' | '9-16'

export function bucketPoints(bucket: PlacementBucket): number

/**
 * Vrne točke po igralcih za en turnir.
 * Vsaka prijava → koš → točke; par razširi na oba player_id.
 */
export function tournamentPlayerPoints(
  registrations: TournamentRegistration[],
  matches: Match[],
): { player_id: string; points: number; bucket: PlacementBucket }[]
```

Določitev koša prijave (po zadnji fazi, kjer je prijava izpadla):
- zmagovalec finala → 1; poraženec finala → 2
- zmagovalec tekme za 3. mesto → 3; poraženec → 4
- poraženec četrtfinala (stage `qf`, ki ni napredoval) → `5-8`
- vse ostale prijave (poraženci `r16`, neuvrščeni iz skupin) → `9-16`

### Engine `src/engines/tournamentSeries.ts` (TDD)

```ts
export interface SeriesPlayerResult {
  player_id: string
  total: number              // seštevek štetih rezultatov
  counted: number[]          // šteti rezultati (najboljših N)
  dropped: number[]          // odbiti najslabši rezultati
  tournaments_played: number
}

/**
 * Združi točke igralca čez vse turnirje serije in uporabi "najboljših N".
 * countBest = null → štejejo vsi.
 */
export function seriesStandings(
  perTournament: { player_id: string; points: number }[],
  countBest: number | null,
): SeriesPlayerResult[]   // razvrščeno padajoče po total
```

### UI

**Admin:**
- `/admin/serije` — seznam serij + ustvari novo (ime, leto, kategorija, N).
- `/admin/serija/:id` — turnirji v seriji (dodaj/ustvari turnir z disciplino) +
  lestvica serije. Vsak turnir se vodi z obstoječim **TournamentEdit**.
- Prilagoditev prijave v TournamentEdit: pri **posamezni** disciplini se prijavi
  samo 1 igralec (`player2_id` = null); pri **dvojki/štafeti** dva.

**Javno:**
- `/serije` — seznam serij.
- `/serija/:id` — lestvica serije (igralec, skupne točke, šteti/odbiti rezultati,
  po turnirjih).

### Testiranje

TDD za oba engina (čisti funkciji): koši uvrstitev in razširitev na pare
(`tournamentPlacement`), najboljših N od M (`tournamentSeries`). UI se preveri
vizualno na Vercel preview deployu z admin sejo.

## Izven obsega (YAGNI)

- Avtomatska integracija v `player_statistics` (titles/podiums).
- Več kot 16 tekmovalcev na turnir.
- Natančen vrstni red znotraj 9.–16. (vsi 1 točka).
- Klubsko / ekipno seštevanje (tekmovanje je individualno).

## Odprto

- **Privzeti N** za novo serijo: predlog `null` (štejejo vsi), admin nastavi po
  potrebi pri ustvarjanju serije.
