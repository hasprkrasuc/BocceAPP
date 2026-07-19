# Večdržavni temelj (A1) — dimenzija države in usmerjanje

**Datum:** 2026-07-19
**Status:** sprejet dizajn, pripravljen za načrt izvedbe

## Namen

balinar.app danes implicitno predpostavlja Slovenijo. Cilj je platforma, kjer
uporabnik ob prihodu izbere državo — najprej Slovenija, nato Hrvaška, kasneje
Srbija, Črna gora in po možnosti Bosna in Hercegovina.

Ta spec pokriva **samo temelj**: dimenzijo države v shemi in usmerjanju. Ne
vsebuje nobenih hrvaških podatkov.

## Razčlenitev na podprojekte

Celotno delo je razdeljeno na štiri podprojekte, vsak s svojim specom in
načrtom:

| | Podprojekt | Vsebina |
|---|---|---|
| **A1** | Večdržavni temelj | **ta dokument** — model države, usmerjanje, migracija SI |
| A2 | Ločitev igralca od računa | tabela `players` brez vezi na `auth.users` |
| B | HR klubi in igralci | scraper in uvoz registra |
| C | HR lige | lestvice in rezultati tekem |
| D | HR zapisniki | PDF razčlenjevalnik za discipline |

A1 je predpogoj za vse ostale. A2 je predpogoj za B.

## Ugotovitve o virih (za kasnejše podprojekte)

Zabeleženo tu, da se raziskava ne izgubi — v A1 se ne uporablja.

`hrvatski-bocarski-savez.hr` je WordPress s strežniško izrisanim HTML. **Ni
JSON API-ja** (`wp-json` obstaja, a podatkov ne vsebuje — klubi, igralci in lige
niso WP objave). Scraping HTML je edina pot.

- `/lige/<liga>/?sezona=2025-2026` — 14 lig, lestvice in kola z rezultati.
  Zgodovina do 2016/17; 2020/21 manjka (covid).
- PDF zapisniki (`Izvješće` ob vsaki tekmi) — postave po disciplinah, izidi,
  sodniki. mPDF z besedilom, ne skeni. Vsebinsko enakovredno podatkom s
  challanger.com.
- `/klubovi-i-igraci/` — 396 klubov in 5977 igralcev v enem 18,7 MB HTML
  odgovoru. Ni paginacije; iskalnika sta odjemalska filtra.
- `/igraci/<slug>/` — poleg osnovnih podatkov tudi "Sportski put": zgodovina
  registracij po sezonah nazaj do ~2016.

Tehnične pasti za B/C/D:

- Stran servira **Windows-1250**, ne UTF-8. Brez eksplicitnega charseta so
  šumniki razbiti.
- **Ni stabilnih ID-jev** — samo slugi, izpeljani iz imen. Že opažen razhod
  (`/igraci/renata-tomic/` z imenom "Renata Abram") in nekaj številčnih klubskih
  slugov. Preimenovanja in dvojniki so realno tveganje pri ponovnih uvozih.
- Imena PDF datotek so ugibljiva, a nedosledna — povezave je treba pobrati z
  ligaških strani, ne sestavljati.

## Odločitve

| Odločitev | Izbrano | Zakaj |
|---|---|---|
| Ločitev držav | `country_id` v eni bazi | Najmanj podvajanja; mednarodni turnirji delujejo naravno |
| Izbira države | Pot v URL (`/si`, `/hr`) | Povezave deljive in enolične; stanje vidno |
| PII obseg (za B) | Minimum za šport | Brez OIB, osebnih kontaktov in zdravniških pregledov |
| Uveljavljanje države | Aplikacija, ne RLS | Država je meja prikaza, ne varnostna meja |

### PII — opomba za podprojekt B

Hrvaška stran javno izpostavlja OIB klubov, osebne e-maile in mobitele
kontaktnih oseb, pri igralcih pa letnice rojstva, številke iskaznic in **datume
zdravniških pregledov**. Javna dostopnost ne pomeni proste obdelave — po GDPR je
uvoz nova obdelava z lastno pravno podlago, zdravstveni podatki pa so posebna
kategorija po čl. 9.

Uvoz zajame le: igralci — ime, št. iskaznice, letnica rojstva, matični klub,
zgodovina registracij; klubi — ime, kraj, županija, liga, panoge, leto
ustanovitve, logo.

Repo je javen — ti podatki ne smejo v teste, fixture, komentarje ali opise PR.
Velja obstoječe pravilo iz `bocceapp-javen-repo-brez-osebnih-podatkov`.

## Podatkovni model

```sql
create table public.countries (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,   -- 'si', 'hr', 'rs', 'me', 'ba'
  name_sl    text not null,          -- 'Slovenija', 'Hrvaška'
  name_local text not null,          -- 'Slovenija', 'Hrvatska'
  is_active  boolean not null default false,
  sort_order integer not null default 0
);
```

`is_active` krmili vidnost v izbirniku. Hrvaška ostane `false`, dokler v njej ni
podatkov — tako lahko podprojekt B uvaža v produkcijo, ne da bi bilo javno
vidno.

`country_id uuid not null references countries(id)` gre na **šest korenskih
tabel**:

`clubs` · `users` · `league_seasons` · `tournaments` · `tournament_series` ·
`calendar_events`

Vse ostale tabele države **ne dobijo** — podedujejo jo prek tujega ključa na
starša: `league_teams`, `league_team_players`, `league_fixtures`,
`league_match_results`, `league_match_discipline_results`,
`league_season_disciplines`, `tournament_registrations`, `tournament_groups`,
`group_teams`, `matches`, `player_statistics`, `guest_players`,
`double_registrations`.

To je namerno. Podvojen `country_id` na otroku je novo mesto, kjer se lahko
razideta s staršem, in ne prinese ničesar.

Vsak `country_id` dobi indeks — filtriramo po njem ob vsakem nalaganju strani.

### Odprto vprašanje: dedovanje pri `matches`

`matches.tournament_id` je **nullable** (`uuid references public.tournaments(id)`,
brez `not null`), prav tako `group_id`. Predpostavka, da vsak otrok doseže državo
prek starša, tu ni zajamčena s shemo.

Pred izvedbo je treba preveriti v produkcijski bazi:

```sql
select count(*) from matches where tournament_id is null and group_id is null;
```

- Če je rezultat 0 in gre le za manjkajočo omejitev, dodaj
  `check (tournament_id is not null or group_id is not null)` in dedovanje drži.
- Če obstajajo osirotele vrstice, jih je treba raziskati posebej — morda gre za
  ostanek, ki ga je treba počistiti, ne pa razlog za `country_id` na `matches`.

Enako preveri, da ima `tournament_groups.tournament_id` omejitev `not null`;
sicer se veriga pretrga tudi prek `group_id`.

### Unique omejitve

Ključi, ki se nanašajo na nacionalni register, dobijo `country_id`:

- `users_emso_unique` → `unique (country_id, emso)`
- vsaka omejitev iz `2026-07-09_import_unique_constraints.sql`, ki se nanaša na
  nacionalni register — vsako je treba preveriti posamično

EMŠO je slovenski konstrukt. Hrvaška uporablja številko iskaznice v obliki
`F922/98`. Zato `users` dobi splošen stolpec `registration_number text` za
nacionalno registrsko številko, z `unique (country_id, registration_number)`.
Obstoječi `emso` **ostane** kot ločen stolpec — vezan je na uvoz iz BZS Excela
in ga A1 ne premika. Za SI vrstice `registration_number` v A1 ostane prazen;
polni ga šele podprojekt B za HR.

Opomba: `users.license_number` že obstaja v shemi. Pred izvedbo preveri, kako je
danes zapolnjen — če hrani ravno nacionalno registrsko številko, se
`registration_number` ne doda in se namesto tega omeji `license_number` z
`unique (country_id, license_number)`.

## Usmerjanje in stanje v UI

Vse javne poti dobijo predpono `/:countryCode`: `/klubi` → `/si/klubi`,
`/liga/:id` → `/si/liga/:id`.

**`CountryProvider`** bere `countryCode` iz poti, ga razreši v zapis iz
`countries` in prek konteksta ponuja `{ countryId, code, name }`. Neveljavna
koda ali neaktivna država preusmeri na privzeto. Vse poizvedbe jemljejo
`countryId` od tu, ne iz lokalnega stanja strani.

**Preusmeritev s korena.** `/` pogleda shranjeno izbiro (localStorage; pri
prijavljenem uporabniku njegov profil), sicer `/si`. Geolokacija se **ne**
uporablja — slovenski uporabnik na dopustu na Hrvaškem noče hrvaške lige.

**Združljivost obstoječih povezav.** Vsaka stara pot dobi preusmeritev na
`/si/<pot>` z ohranjenimi parametri. Povezave kot `/liga/tekma/<uuid>` so že v
obtoku; brez tega bi vsaka do zdaj deljena povezava vrnila 404.

**Gradnja povezav.** `useCountryPath()` oz. tanka ovojnica okoli `Link`, ki
predpono doda sama. Ročno lepljenje predpone na ~40 mestih je zanesljiv način,
da se jih nekaj pozabi.

**Izbirnik** zamenja prvi segment poti in ohrani ostanek, kadar ta obstaja v
ciljni državi; sicer pelje na njeno domačo stran. ID-ji so uuid-i, zato
`/si/liga/<si-uuid>` v `/hr` ne obstaja — preslikava se ne poskuša, pristane se
na `/hr/liga`.

**Brez predpone ostanejo** `/prijava`, `/registracija`, `/profil` in `/admin/*`.
Račun je oseba, ne država, in admin lahko dela čez več držav; sicer bi bilo
treba vsak admin zaslon podvojiti.

## Filtriranje poizvedb

Država je **meja prikaza, ne varnostna meja**. Vsi ti podatki so javni —
lestvice, rosterji, rezultati. Pomešanje SI in HR je napaka v pravilnosti, ne
vdor.

Zato se država **ne** uveljavlja prek RLS. RLS bi moral vedeti, katero državo
uporabnik trenutno gleda, kar pomeni tihotapljenje stanja UI v JWT ali glave
zahtevka — precej mehanike, ki ne varuje ničesar, in ki bi se ob prvem
mednarodnem turnirju (ki mora videti obe državi hkrati) obrnila proti nam.
Obstoječe RLS politike ostanejo nedotaknjene.

Namesto tega filtriranje v aplikaciji, s tremi zaščitami:

1. **Filtriranje samo na koreninah.** Poizvedbe na šest korenskih tabel dobijo
   `.eq('country_id', countryId)`. Otroci ga ne rabijo — dostopni so prek
   filtriranega starša. Od ~180 klicnih mest se jih spremeni približno 55.
2. **Ozek pomožni sloj.** `fromCountry(table, countryId)`, ki filter doda sam.
   Ni abstrakcija čez Supabase — samo ta en zavoj, samo za teh šest tabel.
3. **Test, ki lovi pozabljene.** Preišče `src/` in `api/` za surovimi
   `.from('clubs')` in ostalimi petimi ter pade, če niso šli skozi pomožno
   funkcijo. Teče v CI. To drži disciplino čez čas — ob dodajanju Srbije se
   nihče ne bo spomnil tega dokumenta.

**Skripte za uvoz** v `scripts/` in `api/` ne gredo skozi UI kontekst, zato
morajo državo dobiti kot **izrecen argument, brez privzetka**. Skripta, ki
privzame Slovenijo, je natanko tista, ki bo hrvaške igralce nekoč vpisala v
slovenski register.

## Migracija

Shema v repu in shema v bazi sta se že razšli — štiri tabele in PII stolpci na
`users` so obstajali mimo migracij, `01_out_of_band_schema.sql` jih je šele
dokumentiral, polni `db reset` še ni bil testiran. Zato se ta migracija **piše
po introspekciji produkcijske baze, ne po repu**.

**Korak 0.** Izpis dejanskih stolpcev in omejitev na šestih korenskih tabelah,
primerjava s trditvami repa. Razhajanja se dokumentirajo, preden se karkoli
spremeni. Varnostna kopija prizadetih tabel (ista praksa kot `_bak_zapisnik_*`
pri prepisu liga zapisnika).

**Korak 1.** `countries` + vsebina. Slovenija `is_active = true`; Hrvaška,
Srbija, Črna gora, BiH vpisane a `is_active = false`. Ne spremeni ničesar
obstoječega.

**Korak 2.** `country_id` kot **nullable** na šestih tabelah + indeks na vsakem.

**Korak 3.** Zapolnitev: `update ... set country_id = <si> where country_id is
null`. Vsi obstoječi podatki so slovenski — to ni ugibanje.

**Korak 4.** `not null` + prehodni privzetek na SI za skripte, ki stolpca še ne
pošiljajo. Privzetek pade takoj, ko so skripte prevezane — privzetek, ki
ostane, je isti tihi tovornjak v napačno državo. V tem koraku tudi popravek
unique omejitev.

Vsak korak je samostojno preklican.

**Vrstni red izdaje:** migracija (koraki 1–3) gre v produkcijo **pred** kodo.
Nullable stolpec, ki ga nihče ne bere, je neškodljiv; koda, ki bere stolpec, ki
ga še ni, ni.

## Preverjanje

**Nič slovenskega ne izgine.** Števci po šestih korenskih tabelah in glavnih
otrocih pred in po migraciji morajo biti identični. `where country_id is null`
mora vrniti nič vrstic.

**Aplikacija se obnaša enako kot prej.** Ročni obhod `/si`: klubi, igralec,
liga z lestvico, zapisnik tekme, statistika, koledar, rang. To ni test enot —
to je preverjanje, da 55 spremenjenih klicnih mest ni ničesar tiho odrezalo.
Filter, ki vrne prazen seznam namesto napake, je natanko okvara, ki je tipi ne
ujamejo.

**Stare povezave delujejo.** `/liga/tekma/<uuid>` → `/si/liga/tekma/<uuid>` z
isto vsebino, preverjeno na resničnem uuid-u iz baze.

**Prazna država ne razpade.** Časovni vklop Hrvaške na `is_active = true`,
obisk `/hr/klubi`, `/hr/liga`, `/hr/statistika`. Vsaka mora pokazati pošteno
prazno stanje — ne vrtečega kolesca, ne strte strani, ne slovenskih podatkov.
To je najpomembnejši test A1, ker je to stanje, v katerem bo Hrvaška živela ves
čas podprojekta B. Po preverjanju vklop nazaj na `false`.

**CI:** test iz razdelka o filtriranju, ki lovi nefiltrirane `.from()` na
koreninah.

## Zunaj obsega A1

- Kakršni koli hrvaški podatki ali scraper (B, C, D)
- Ločitev `players` od `auth.users` (A2)
- Prevod vmesnika v hrvaščino — jezik je ločen od države; vmesnik ostane
  slovenski tudi na `/hr`
- Geolokacijsko zaznavanje države
- Mednarodni turnirji čez več držav
