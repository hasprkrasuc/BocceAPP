# Direktni izločilni sistem (knock-out brez skupin) za DP — zasnova

**Datum:** 2026-07-04
**Status:** potrjena zasnova
**Veja:** `feature/dp-knockout-format`

## Cilj

Omogočiti, da državna prvenstva (DP) potekajo kot **direktni izločilni sistem
(knock-out) brez skupinskega dela in brez tolažilnega žreba (repasaža)**.
Sprememba je **dodatek** — obstoječi skupinski sistem (dvojna eliminacija po
skupinah → izločilni del iz napredovalcev) ostane popolnoma nedotaknjen.

Poln potek v aplikaciji: admin naredi žreb po nosilcih → vnaša rezultate →
aplikacija **samodejno napreduje** skozi kroge do finala + tekme za 3. mesto →
končni vrstni red šteje v rang lestvico.

## Obseg (potrjene odločitve)

- **Živost:** poln potek s samodejnim napredovanjem krogov.
- **Žreb:** nosilci po rang lestvici kategorije; proste (bye) najboljšim, kadar
  število ekip ni potenca 2.
- **Velikost mreže:** do **128** ekip/igralcev (dodam kroge `r128`, `r64`, `r32`).
- **Discipline:** posamični nastop (posamezno, igra v krog, bližanje v krog,
  hitrostno zbijanje, natančno izbijanje) → 1 igralec/prijava; par (dvojice,
  štafeta) → 2 igralca/prijava. (Že obstoječe pravilo `isPairDiscipline`.)

## 1. Podatkovni model

### Baza (dve migraciji prek Supabase MCP)

1. **`tournaments.format`**
   ```sql
   alter table tournaments
     add column format text not null default 'groups'
     check (format in ('groups','knockout'));
   ```
   Obstoječi turnirji ostanejo `'groups'`.

2. **Razširjen `matches.stage` CHECK**
   ```sql
   alter table matches drop constraint matches_stage_check;
   alter table matches add constraint matches_stage_check
     check (stage in ('group','r128','r64','r32','r16','qf','sf','final','third_place'));
   ```

### Nosilna skupina

`group_teams.group_id` je NOT NULL, zato vsak knock-out turnir dobi **eno
kontejnersko skupino** (`tournament_groups`, `group_number = 1`), v katero se
vpišejo vse ekipe kot `group_teams`. Izločilne tekme imajo `group_id = null`
(kot že zdaj velja za izločilne tekme iz skupin), `team_a_id`/`team_b_id`/
`winner_id` pa kažejo na `group_teams`. Shema ostane nespremenjena.

### Tipi (`src/types.ts`)

- `Tournament.format: 'groups' | 'knockout'`
- `MatchStage` dopolnim z `'r128' | 'r64' | 'r32'` (če manjkajo).

## 2. Žreb po nosilcih

Vhod: potrjene prijave (`status = 'confirmed'`) turnirja + kategorija turnirja.

1. Prek `computeRangLestvica()` dobim rang lestvico kategorije (ista kot na
   /rang) in zgradim `playerId → rangTočke` (številčna vrednost `rang`;
   višje = boljše). Igralec brez uvrstitve → 0 točk.
2. Vsaki prijavi določim **nosilno vrednost** = vsota rang točk njenih igralcev:
   - **Posamezno:** `rangTočke(p1)`.
   - **Dvojice/štafeta:** `rangTočke(p1) + rangTočke(p2)` (skupna vsota para).
   - Izenačenje → deterministično po `registration.id`.
3. Prijave razvrstim padajoče po nosilni vrednosti → nosilne številke 1..N
   (najvišja vsota = nosilec 1). Ekipe brez rang točk (vsota 0) so zadnje.

Rang lestvica se izračuna enkrat ob žrebu (admin akcija) — sprejemljiv strošek.

## 3. Gradnja mreže (čista logika, `src/engines/knockout.ts`)

- `N` = št. potrjenih ekip; `B = 2^ceil(log2(N))`, omejeno na **128**.
  - `N < 2` → napaka; `N > 128` → napaka.
- `bye = B − N`.
- **Nosilni razpored `seedOrder(B)`** — standardni razpored, da se nosilca 1 in 2
  srečata šele v finalu, 1–4 v polfinalu itd. (rekurzivni "1, B, B/2+1, B/2 …").
- Ekipe (nosilci 1..N) postavim na pozicije po `seedOrder`; pozicije N+1..B so
  prazne (bye).
- **Imena krogov** po velikosti `B`: 128→`r128`, 64→`r64`, 32→`r32`, 16→`r16`,
  8→`qf`, 4→`sf`, 2→`final`.
- **Ustvarim vse kroge naenkrat** (prazna mesta), 1. krog napolnjen po nosilcih:
  - Tekma z eno pravo ekipo in eno prosto → **bye tekma**: `is_bye = true`,
    `status = 'completed'`, `winner_id = prava ekipa`, `score 6:0`; zmagovalec se
    takoj prestavi naprej (glej §4).
  - Tekma z dvema pravima ekipama → `status = 'pending'`.
- **Tekma za 3. mesto** se ustvari, če obstaja polfinale (`B ≥ 4`).
- `match_number` teče znotraj vsakega kroga (1..).

Izhod čiste funkcije `buildKnockoutBracket(seededTeams)`: seznam krogov s
tekmami (stage, match_number, teamA/teamB indeksi ali bye), pripravljen za vpis.

## 4. Samodejno napredovanje

**Čista logika** `knockoutPropagation(matches)` (testirana, brez DB) izračuna,
kam gredo zmagovalci:

- **Preslikava naprej:** krog `r`, tekma `i` (0-indeks) → naslednji krog, tekma
  `⌊i/2⌋`, mesto `i%2` (0 = `team_a`, 1 = `team_b`).
- **Tekma za 3. mesto:** poraženca polfinala → mesti tekme za 3. mesto.
- Ponavlja do stabilnosti, da bye/verige stečejo naenkrat.

**DB-ovojnica** `propagateKnockout(tournamentId)` (v `Tournament.tsx`, analogna
obstoječi `propagateGroup`): prebere izločilne tekme turnirja, požene
`knockoutPropagation`, zapiše spremembe.

Vgradnja v `handleSaveScore`:
```
if (match.group_id) await propagateGroup(match.group_id)
else                await propagateKnockout(match.tournament_id)
```
Kliče se tudi takoj po žrebu (za razrešitev bye v 1. krogu).

**Stranski učinek (dobrodošel):** s tem se prvič samodejno napolnijo kasnejši
izločilni krogi — obstoječa vrzel, kjer je bil ustvarjen le prvi krog.

## 5. Uporabniški vmesnik

### `TournamentAdmin` (ustvarjanje)

- Nov izbirnik **"Sistem tekmovanja"**:
  - `Skupinski + izločilni` → `format = 'groups'`
  - `Direktni izločilni (brez skupin)` → `format = 'knockout'`
- Privzeto: **`groups` za oba tipa** (turnir in državno prvenstvo); admin ročno
  izbere `knockout`, kadar želi direktni izločilni sistem.
- Pri `knockout` skrijem polje "Ekipe v skupini" (`group_size` se ne uporablja).

### `TournamentEdit` (admin urejanje)

- Pri `format = 'knockout'`:
  - Skrijem zavihek **"Žreb skupin"**.
  - Dodam **"Izločilni žreb"**: gumb *Naredi žreb po nosilcih* + predogled
    (velikost mreže `B`, št. prostih, seznam nosilcev po vrsti). Ponovni žreb z
    obvestilom — izbriše obstoječo mrežo (kontejnersko skupino + izločilne tekme)
    in jo naredi znova.
- Pri `format = 'groups'` ostane vse kot je (zavihka "Žreb skupin" +
  "Izločilni del" z `generateKnockout` iz napredovalcev).

### `Tournament.tsx` (javni prikaz)

- Pri `format = 'knockout'` skrijem zavihek "Skupine"; prikaz prek obstoječega
  `KnockoutBracket`. Vnos rezultatov nespremenjen.

### `KnockoutBracket`

- Dodam kroge `r128`/`r64`/`r32` (širine stolpcev + oznake prek `stageLabel`:
  1/64, 1/32, 1/16 finala).
- Bye prikažem kot "prosto" (nasprotnik zmagovalca 1. kroga).

## 6. Točkovanje / rang

- **Rang (DP):** `championshipPoints` (na veji `feature/dp-championships`) že
  pravilno točkuje: finale 16/10, za 3. mesto 8/7, deljeni bron kot rezerva,
  qf = 3, r16 = 1, **r32/r64/r128 poraženci = 0** (točkuje se do 16. mesta).
  Ta funkcija tukaj ne potrebuje sprememb.
- **`tournamentPlacement`** (prikaz uvrstitev turnirja, ne rang): trenutno vsem
  neuvrščenim prijavam dodeli 1 t (9.–16.) — pri veliki mreži (32/64/128) je to
  napačno. **Pri implementaciji:** preverim, kje se uporablja; če vpliva na
  knock-out prikaz, omejim "9.–16." le na dejanske poražence `r16`, ostale
  (izpad v r32+) pustim brez točk. Če se za DP/knock-out ne uporablja (rang
  uporablja `championshipPoints`), pustim nespremenjeno.

## 7. Robni primeri / YAGNI

- `N < 2` → napaka ("premalo prijav za izločilni žreb").
- `N > 128` → napaka (v praksi se ne zgodi).
- N ni potenca 2 → proste najboljšim nosilcem.
- `B = 2` (samo finale) → brez tekme za 3. mesto.
- Ponovni žreb dovoljen z obvestilom; izbriše prejšnjo mrežo.
- **Namenoma NE delamo:** urejanja igralnih časov/prizorišč, ročnega premikanja
  ekip v mreži (možno kasneje), repasaža/tolažilnega žreba.

## 8. Testiranje (TDD, Vitest)

Čiste funkcije v `src/engines/knockout.ts` (brez DB/UI):

- `seedOrder(B)` — standardni nosilni razpored (1↔B, 2↔B-1 …); preveri, da se 1
  in 2 srečata šele v finalu.
- `buildKnockoutBracket(seededTeams)` — pravilni krogi, imena krogov po `B`,
  bye najboljšim nosilcem, tekma za 3. mesto pri `B ≥ 4`, robni `B = 2`.
- `knockoutPropagation(matches)` — zmagovalci tečejo naprej + polfinalni poraženci
  v tekmo za 3. mesto; verige bye stečejo do stabilnosti.
- razvrstitev po rangu — posamezno (točke igralca) in dvojice (vsota točk para),
  izenačenja deterministična, ekipe brez rang točk zadnje.

DB/UI ostane tanka plast okoli testiranih čistih funkcij.

## Datoteke

- **Novo:** `src/engines/knockout.ts` (+ `knockout.test.ts`)
- **Sprememba:** `src/types.ts` (format, MatchStage), `src/pages/admin/TournamentAdmin.tsx`
  (izbirnik formata), `src/pages/admin/TournamentEdit.tsx` (izločilni žreb),
  `src/pages/Tournament.tsx` (propagateKnockout, skrit skupinski zavihek),
  `src/components/KnockoutBracket.tsx` (novi krogi), `src/engines/tournament.ts`
  (oznake krogov, po potrebi).
- **Migraciji:** `tournaments.format`, razširjen `matches.stage` CHECK.
