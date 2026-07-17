# Skupinski sistem lig (2 skupini po 6 + nadaljevalni skupini) — načrt

**Datum:** 2026-07-09
**Status:** potrjena zasnova

## 1. Cilj

Omogočiti, da admin v aplikaciji ustvari sezono s **skupinskim sistemom** (2 skupini po 6 → nadaljevalni skupini 1-6 in 7-12), kot ga uporabljajo 1. liga in 2. ligi. Danes aplikacija zna zgenerirati **samo raven round robin čez vse ekipe** in nikjer ne zapiše `group_label` — ves skupinski sistem so doslej naredile zunanje uvozne skripte.

**Prikaz je že v celoti narejen** in pravilen (`calculateGroupStandings` v `src/engines/league.ts`, vključno s prenosom medsebojnih iz faze 1). Manjka izključno **ustvarjanje**.

## 2. Zakaj je to potrebno zdaj

Stanje sezon 2025/26 (izmerjeno v bazi):

| Liga | Ekip | Struktura |
|---|---|---|
| 1. liga | 12 | **skupine A/B + 1-6/7-12** |
| 2. liga zahod | 12 | **skupine A/B + 1-6/7-12** |
| 2. liga vzhod | 10 | raven RR (premalo ekip za 2×6) |
| Super liga, 1. liga članice | 9 / 8 | raven RR |

2. liga vzhod bo 2026/27 imela 12 ekip. Brez te funkcije bi bilo treba skupinske sezone spet delati ročno prek SQL.

## 3. Format sezone — obe možnosti povsod

`league_seasons` dobi nov stolpec **`format`**: `'flat'` (privzeto, raven round robin — obstoječe vedenje) ali `'groups'` (skupinski sistem).

**Odločitev uporabnika:** obe možnosti sta na izbiro v **vseh** ligah — format ni vezan na `tier`. Admin ga izbere ob ustvarjanju sezone.

Obstoječe sezone ostanejo `'flat'`; zgodovinske skupinske sezone (uvožene) se lahko naknadno označijo kot `'groups'` — na prikaz to ne vpliva, ker se ta odloča po `group_label` na tekmah (nespremenjeno).

## 4. Žreb

**Žreb izvede BZS fizično** (tam upoštevajo odvisnosti zaradi rezervnih terenov — aplikaciji teh ni treba poznati). Admin v aplikacijo vnese le **izid žreba**:

- vsaka ekipa dobi **skupino** (`A` ali `B`) in **žrebno številko 1–6 znotraj skupine**
- shrani se v `league_teams.group_label` (`'A'`/`'B'`) in `league_teams.draw_number` (1–6)
- oba stolpca v živi bazi **že obstajata, a sta povsod prazna** (0/12) — nič jih ne polni

**Validacija pred generiranjem:** vsaka skupina mora imeti natanko 6 ekip s številkami 1–6 brez podvojitev in brez lukenj.

## 5. Faza 1 — generiranje

- Za **vsako skupino posebej** poženi `bergerFixtures(6 ekip, dvojni krog)` (obstoječi `src/engines/berger.ts` ima tabelo za 6 ekip).
- Rezultat: 30 tekem na skupino (6×5), vsaka ekipa **10 tekem** = round robin doma in v gosteh ✓ (potrjeno pravilo).
- Vse tekme faze 1 dobijo `group_label` = `'A'` oz. `'B'`, kola **1–10**.
- `berger.ts` zahteva zvezne žrebne številke `1..N` — zato se kliče **na skupino** (vsaka ima svoje 1–6), ne na vseh 12.

## 6. Faza 2 — generiranje (ločen korak)

Ločen gumb, na voljo **ko je faza 1 odigrana**.

### 6a. Delitev
- Aplikacija izračuna lestvici skupin A in B (obstoječi kriteriji: točke → medsebojni → razlika iger).
- **Predlaga**: po **3 najboljše** iz vsake skupine → `1-6`; po 3 najslabše → `7-12`.
- **Admin predlog potrdi ali popravi.** Nujno: ob popolnem izenačenju o napredovanju odloči **žreb** (BZS), česar aplikacija ne more narediti sama.

### 6b. Pozicije
Pozicije v tabeli spodaj pomenijo **končno uvrstitev v fazi 1**, NE žrebne številke:
- `A1`,`A2`,`A3` = 1./2./3. iz skupine A; `B1`,`B2`,`B3` = 1./2./3. iz skupine B
- v skupini `7-12` velja preslikava **1→4, 2→5, 3→6** (torej `A4`,`A5`,`A6` proti `B4`,`B5`,`B6`)

### 6c. Fiksna tabela parov (domači : gostje) — skupina 1-6

| Kolo (globalno) | Pari |
|---|---|
| 1 (11) | A1:B3 · A2:B1 · A3:B2 |
| 2 (12) | B2:A1 · B3:A2 · B1:A3 |
| 3 (13) | A1:B1 · A2:B2 · A3:B3 |
| 4 (14) | B3:A1 · B1:A2 · B2:A3 |
| 5 (15) | A1:B2 · A2:B3 · A3:B1 |
| 6 (16) | B1:A1 · B2:A2 · B3:A3 |

Kola 4–6 so **obratna** od kol 1–3 (zamenjana domači/gostje).

Za skupino `7-12` ista tabela s preslikavo 1→4, 2→5, 3→6.

**Lastnosti (preverjene):** vsaka ekipa igra proti **vsem trem** iz druge skupine, **doma in v gosteh** → 6 tekem; razmerje doma/v gosteh je 3:3. **Nobenega para znotraj iste stare skupine** — teh se ne igra znova.

### 6d. Prenos rezultatov
Proti dvema ekipama, ki sta prišli iz **iste** skupine, se **ne igra znova** — njuni rezultati iz faze 1 se **prenesejo** (2 nasprotnika × 2 tekmi = 4 tekme).

**Skupaj v nadaljevalni lestvici: 4 prenesene + 6 novih = 10 tekem.**

To že dela obstoječi `calculateGroupStandings` (`league.ts:228-230`): vzame tekme faze 1, kjer sta **obe** ekipi v isti nadaljevalni skupini. Ker faza 2 ne podvaja parov iz faze 1, se nič ne šteje dvakrat. **Nič novega ni treba pisati.**

### 6e. Kola in `rounds_count`
- Faza 2 = kola **11–16** (nadaljujejo za fazo 1).
- `rounds_count` = **16** (kot ima 1. liga 2025/26). Za skupinske sezone se lestvica računa prek `calculateGroupStandings`, ki `rounds_count` ne uporablja; vseeno naj bo pravilen, ker `calculateStandings` z njim izloča končnico.

## 7. Prikaz — brez sprememb

`League.tsx` že zazna skupine (`hasGroups` = obstaja tekma z `group_label` `'A'`/`'B'`) in izriše "Faza 1 — Skupinski del" + nadaljevalni skupini. Članstvo v skupini se izpelje **iz samih tekem**, ne iz `league_teams` — zato dodatek `group_label` na `league_teams` prikaza ne spremeni (rabimo ga za žreb/generiranje).

## 8. Migracije — odpravi zdrs

`supabase/migrations/` **ne opisuje več žive baze**: stolpci `group_label` (na `league_fixtures`), `draw_number`, `tier` in tri cele tabele (`league_match_results`, `league_match_discipline_results`, `league_season_disciplines`) obstajajo v bazi, a jih nobena migracija ne ustvari. Svež `00_schema.sql` bi dal bazo, na kateri se aplikacija sesuje.

V okviru te naloge:
- nova migracija doda `league_seasons.format` in `league_teams.group_label` (če manjka)
- **dokumentira** obstoječe netrackane stolpce/tabele (`create ... if not exists`), da je shema spet verodostojna

## 9. Robni primeri

- Skupina nima natanko 6 ekip / številke niso 1–6 / podvojena številka → jasna napaka, brez generiranja.
- Generiranje faze 1 dvakrat → izbriše in na novo ustvari **samo tekme faze 1** (ne sme pobrisati faze 2, če ta že obstaja — oz. opozori).
- Generiranje faze 2, ko faza 1 ni odigrana → opozorilo (lestvica ni dokončna), a dovoli (admin ve, kaj dela).
- Sezona s formatom `'flat'` → obstoječe vedenje, nespremenjeno.
- Manj ali več kot 12 ekip pri formatu `'groups'` → napaka (2×6 je edina podprta oblika).

## 10. Testiranje

- **Enote (čista logika):** generator faze 2 iz tabele — preveri, da vsaka ekipa igra vse tri nasprotnice doma in v gosteh, 3:3 doma/gosti, 18 parov, 0 parov znotraj iste stare skupine, pravilna kola 11–16, preslikava 1→4/2→5/3→6 za 7-12.
- **Enote:** validacija žreba (6 ekip, 1–6, brez dvojnikov).
- **Enote:** faza 1 = 30 tekem na skupino, vsaka ekipa 10, pravilne oznake.
- **Regresija:** obstoječi `calculateGroupStandings` testi morajo še vedno prestati; prenos medsebojnih iz faze 1 se ne spremeni.
- **E2E:** testna sezona s formatom `'groups'`, 12 ekip, vnos žreba → generiraj fazo 1 → vpiši nekaj izidov → generiraj fazo 2 → preveri prikaz (Faza 1 A/B + nadaljevalni skupini s prenosom).

## 11. Zunaj obsega

- Samodejni žreb v aplikaciji (BZS žreba fizično — potrjeno).
- Model terenov klubov (odvisnosti se rešujejo na žrebu).
- Drugačne oblike skupin (3×4, 2×5 …) — samo 2×6.
- Sprememba formata **obstoječe** sezone s tekmami (najprej pobriši razpored).
- Zgodovinski format 2023/24 (takrat je bila faza 2 poln round robin, 30 tekem) — gradimo po **sedanjem** pravilu.
