# Uvoz igralcev iz BZS registracijskega Excela — načrt

**Datum:** 2026-07-09
**Status:** predlog za pregled

## 1. Cilj

Admin na balinar.app naloži uradni obrazec BZS *"Evidenca in registracija igralcev po klubih"* za en klub in aplikacija:
1. ustvari/posodobi igralce (`users` + prijavni račun),
2. jih poveže s klubom (`users.club_id`) → posodobi stran `/klubi`,
3. jih doda v izbrano ligaško ekipo (`league_team_players`) → štejejo v ligi.

Brez ročnega vnašanja igralca za igralcem in brez ročnega SQL. Med sezono se posamezen nov igralec doda prek kratkega ročnega obrazca (ista logika zadaj).

## 2. Vir podatkov (Excel)

Standardni obrazec (ena datoteka = en klub). Struktura (potrjeno na `Begunje.xlsx`):

- **Glava (vrstice ~0–10):** naslov s sezono ("... ZA SEZONO 2025/26"), Območna zveza, **Balinarski klub**, Matična št., Davčna št., Naslov, Kontaktna oseba, Telefon, E-naslov kluba, Predsednik.
- **Tabela igralcev (glava v 2 vrsticah, nato podatki):** stolpci — Klub, **Ime**, Priimek, Športna št. (neobvezno), **Spol**, **Datum rojstva**, **EMŠO**, Kraj rojstva, Država rojstva, Državljanstvo, Ulica, Hišna številka, Poštna številka, Kraj, E-Antidoping, Podpis.
- **Noga (za tabelo):** "Vodje ekipe …", barve dresov, izjave (nastop, GDPR), datum, žig.

### Posebnosti vira (parser jih mora obvladati)
- **Klub** se bere iz **glave** ("Balinarski klub"), NE iz stolpca "Klub" v tabeli — ta ima v podatkih tipkarske napake (npr. "BK BEGUNJUE" proti "BK BEGUNJE").
- **Datum rojstva** je v **dveh oblikah**: Excelova serijska številka (npr. `38515`) in besedilo (npr. `"6.5.2010"`, `"2.02.1962"`). Parser podpira obe → normalizira v enoten zapis (kot obstoječi `date_of_birth` tekst, npr. `YYYY-MM-DD`).
- **EMŠO** = 13 števk; validira se (dolžina + kontrolna števka). Neveljavni → označeni kot napaka, se NE uvozijo.
- **"Vodje ekipe"** (managerji) so ločeno polje pod tabelo → se **NE** uvozijo kot igralci (skladno z obstoječo logiko, da vodje niso na ligaški poti).
- Tabela se konča ob prvi prazni vrstici / začetku noge.

## 3. Preslikava polj

### `users` (obstoječi stolpci)
| Excel | users stolpec |
|---|---|
| Ime + Priimek | `full_name` |
| Spol (M/Ž) | `gender` |
| Datum rojstva | `date_of_birth` |
| EMŠO | `emso` |
| Kraj rojstva | `birth_city` |
| Država rojstva | `birth_country` |
| Državljanstvo | `citizenship` |
| Ulica | `address_street` |
| Hišna številka | `address_house` |
| Poštna številka | `address_postal` |
| Kraj (bivališče) | `address_city` *(nov stolpec — migracija)* |
| (klub iz glave) | `club` (tekst) + `club_id` (FK) |

### `clubs` (obstoječi stolpci; klub se ustvari, če ne obstaja)
| Excel (glava) | clubs stolpec |
|---|---|
| Balinarski klub | `name` |
| Kontaktna oseba | `contact_name` |
| Elektronski naslov kluba | `contact_email` |
| Telefon | `contact_phone` |
| Naslov (kraj) | `city` |
| Matična/Davčna št. | `notes` *(ni namenskih stolpcev)* |

### `league_team_players`
- `league_team_id` = izbrana ekipa (iz UI), `player_id` = igralčev `users.id`.
- `league_teams` ostane s prostim `club_name` (brez `club_id`) — nespremenjeno.

## 4. Uporabniški tok

### 4a. Množičen uvoz — nova admin stran `/admin/uvoz-igralcev`
1. Admin izbere **ciljno sezono → ligo → ekipo**: obstoječo ekipo ALI vpiše novo (ime iz glave Excela predlagano; uvoz jo ustvari).
2. Naloži `.xlsx`.
3. **Predogled** (brez pisanja): klub iz glave + tabela igralcev, vsak s statusom:
   - 🟢 **nov** — bo ustvarjen,
   - 🔵 **obstaja** — bo posodobljen (dopolnjeni manjkajoči podatki),
   - 🟡 **prestop** — EMŠO obstaja z drugim klubom → matični klub se premakne sem,
   - 🔴 **napaka** — neveljaven/manjkajoč EMŠO ali manjkajoče ime → izpuščen.
4. Admin potrdi → izvedba prek Edge Function → **poročilo** (št. ustvarjenih / posodobljenih / dodanih v ekipo / izpuščenih z razlogi).

### 4b. Posamezen nov igralec med sezono — obrazec "Dodaj novega igralca"
- Kratek obrazec (ime, priimek, EMŠO, datum rojstva, spol, izbira kluba + ekipe) → **ista Edge Function** z enim zapisom.
- Dostopen tudi iz LeagueAdmin (poleg obstoječega "+ Dodaj igralca", ki doda le OBSTOJEČEGA — nov gumb "+ Ustvari novega").

## 5. Prepoznava in prestopi

- **Ključ ujemanja = EMŠO.** Če EMŠO manjka: rezervno ujemanje po `full_name` + `date_of_birth`; če tudi to ne najde, ustvari novega.
- **Obstoječi igralec:** posodobi `club_id` (na uvozni klub), dopolni manjkajoče (naslov, datum, spol, EMŠO); NE prepiše že obstoječih ne-praznih polj po nepotrebnem (varno spajanje).
- **Prestop** (EMŠO obstaja, drug `club_id`): **premakne v nov klub** (posodobi `club_id`) — potrjena odločitev.
- **Idempotentno:** ponovni uvoz iste datoteke ne podvaja (EMŠO dedup) → varno za popravke in dodajanje novega igralca prek ponovnega uvoza.

## 6. Arhitektura

- **Frontend (admin stran):** parsiranje Excela v brskalniku z `xlsx` (že v projektu). Sestavi seznam normaliziranih zapisov + predogled statusov (ujemanje po EMŠO prek branja `users` z anon/authenticated ključem — branje je javno dovoljeno).
- **Backend (Supabase Edge Function, service role):** sprejme `{ klub, ciljna_ekipa_id, igralci[] }`, atomarno:
  1. najde/ustvari `clubs` vrstico,
  2. za vsak zapis: najde po EMŠO ali ustvari `auth.users` (prožilec `handle_new_user` ustvari `public.users`), nato **posodobi** `public.users` z vsemi polji + `club_id`,
  3. vstavi `league_team_players` (če še ni),
  4. vrne poročilo.
- **Zakaj Edge Function:** `public.users.id` je FK na `auth.users(id)` → ustvarjanje igralca zahteva `auth.admin.createUser` (service role), ki v brskalniku ni dovoljen.
- **Prijavni računi:** ustvarijo se s sintetičnim e-naslovom (`ime.priimek.<uuid>@balinar.app`) in naključnim geslom (igralci se lahko kasneje registrirajo/ponastavijo). Vzorec kot pri obstoječih uvozih.

## 7. Robni primeri in varovala

- Manjkajoč/neveljaven EMŠO → 🔴, izpuščen (z razlogom v poročilu).
- Dvojnik EMŠO znotraj iste datoteke → uvozi se enkrat, opozorilo.
- Klub iz glave se ne ujema z nobenim obstoječim → ustvari nov `clubs` (admin v predogledu vidi "nov klub: …").
- Igralec že v izbrani ligaški ekipi → preskoči vstavljanje (brez podvajanja rosterja).
- Napačna/nepričakovana struktura Excela (ni glave "Balinarski klub" ali tabele) → jasna napaka pred predogledom, brez pisanja.
- Vse pisanje samo prek Edge Function; ob napaki na sredini → poroča, katere zapise je uspešno obdelal (ali transakcijsko razveljavi — glej O4).

## 8. Testiranje

- **Parser (enote):** glava (klub, sezona), obe obliki datuma, EMŠO validacija, konec tabele ob nogi, ignoriranje "Vodje ekipe". Testni vzorec: `Begunje.xlsx` (20 igralcev, oba formata datuma, tipkarski klub v stolpcu).
- **Ujemanje:** nov / obstoječ / prestop / neveljaven EMŠO.
- **Edge Function:** idempotentnost (dvakratni uvoz = brez podvajanja), ustvarjanje kluba, dodajanje v ekipo.
- **E2E (ročno):** naloži `Begunje.xlsx` na testni ekipi → predogled → uvoz → preveri /klubi (člani) in ligaški roster.

## 9. Zunaj obsega V1

- Autocomplete kluba pri ročnem dodajanju ligaške ekipe (tvoje 2. vprašanje — ločena manjša izboljšava; lahko sledi takoj za tem).
- Ena datoteka → več ekip/kategorij hkrati (V1: ena izbrana ekipa; klubski člani se vseeno dodajo vsi iz datoteke).
- Ločena evidenca vodij (managerjev).
- Uvoz fotografij / podpisov.

## 10. Potrjene odločitve

- **O1 — `address_city`:** doda se nov stolpec `users.address_city` (majhna migracija); Excel "Kraj" (bivališče) se mapira vanj.
- **O2 — matična/davčna št. kluba:** shrani se v `clubs.notes` (npr. "Matična: … · Davčna: …").
- **O3 — ustvarjanje ekipe:** uvoz zna tudi **ustvariti** ligaško ekipo v izbrani ligi, če še ne obstaja (odpade ročni korak "Dodaj ekipo"). V UI: izbereš sezono+ligo, nato obstoječo ekipo ALI vpišeš novo (ime iz glave Excela je predlagano).
- **O4 — atomarnost:** cel uvoz je **ena transakcija (vse ali nič)** za predvidljivost; ob napaki se razveljavi in poroča vzrok.
