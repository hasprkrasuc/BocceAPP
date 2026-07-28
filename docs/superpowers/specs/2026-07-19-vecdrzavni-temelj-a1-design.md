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
- **Ni stabilnih ID-jev** — samo slugi, izpeljani iz imen. Že opažen razhod:
  profil igralke, katere slug nosi drug priimek kot trenutno prikazano ime
  (menjava priimka; konkretni primer namenoma ni naveden — repo je javen), in
  nekaj številčnih klubskih slugov. Preimenovanja in dvojniki so realno
  tveganje pri ponovnih uvozih.
- Imena PDF datotek so ugibljiva, a nedosledna — povezave je treba pobrati z
  ligaških strani, ne sestavljati.

## Odločitve

| Odločitev | Izbrano | Zakaj |
|---|---|---|
| Ločitev držav | `country_id` v eni bazi | Najmanj podvajanja; mednarodni turnirji delujejo naravno |
| Izbira države | Pot v URL (`/si`, `/hr`) + domena | Povezave deljive; lastna domena brez forka kode |
| PII obseg (za B) | Minimum za šport | Brez OIB, osebnih kontaktov in zdravniških pregledov |
| Branje javnih podatkov | Filter v aplikaciji | Meja prikaza, ne varnostna meja |
| Pisanje in branje PII | RLS, vezan na državo | **Je** varnostna meja — admin iz HBS ne sme do SI osebnih podatkov |

### Zakaj ne ločena baza na državo

Obravnavano in zavrnjeno. Ločen repo in instanca na državo (npr. bocanje.top s
svojo bazo) bi bila kratkoročno hitrejša, a:

- **Petkratno vzdrževanje iste kode.** Kopije se razidejo; ena obleži.
- **Razbita identiteta igralcev.** Igralec iz Klane ima uuid v HR bazi. Ob
  nastopu na Turnirju petih držav v SI bazi ga ni — ustvari se znova, z drugim
  uuid-om, brez povezave. Statistika se razdeli na dva kupa. Nadnacionalni
  register, ki to reši, je natanko enotna baza — samo zgrajena dvakrat.
- Zahteva po skupni statistiki in skupnih igralcih za mednarodne turnirje
  (Klana Open, Turnir petih držav) je torej argument **proti** ločitvi.

Organizacijska meja (admin iz HBS ureja le Hrvaško) je resnična, a se rešuje s
pravicami po državi, ne z ločeno bazo — glej razdelek o admin pravicah.

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

`country_id uuid not null references countries(id)` gre na **sedem korenskih
tabel**:

`clubs` · `users` · `league_seasons` · `tournaments` · `tournament_series` ·
`calendar_events` · `guest_players`

`guest_players` je korenska tabela, čeprav je majhna: je samostojen register
brez tujega ključa na starša (`2026-07-16_guest_players_reusable.sql` — nanjo
kaže `tournament_registrations`, ne obratno, in vrstice legitimno obstajajo
nereferencirane). Države torej ni mogoče izpeljati — dobi svoj `country_id`,
indeks in admin politiko po državi.

Vse ostale tabele države **ne dobijo** — podedujejo jo prek tujega ključa na
starša: `league_teams`, `league_team_players`, `league_fixtures`,
`league_match_results`, `league_match_discipline_results`,
`league_season_disciplines`, `tournament_registrations`, `tournament_groups`,
`group_teams`, `matches`, `player_statistics`, `double_registrations`.

To je namerno. Podvojen `country_id` na otroku je novo mesto, kjer se lahko
razideta s staršem, in ne prinese ničesar.

Vsak `country_id` dobi indeks — filtriramo po njem ob vsakem nalaganju strani.

### Dedovanje pri `matches` — preverjeno 2026-07-19

`matches.tournament_id` in `group_id` sta v shemi **nullable**, zato dedovanje
države prek starša ni bilo zajamčeno. Preverjeno v produkciji:

| | |
|---|---|
| `matches` skupaj | 541 |
| brez `tournament_id` | **0** |
| brez `group_id` | 164 (izločilne tekme — pričakovano) |
| osirotele (oba null) | **0** |
| `tournament_groups` brez `tournament_id` | **0** od 68 |

Veriga je cela. `tournament_id` je v praksi že obvezen — shemi manjka le izjava o
tem. Ukrep v migraciji:

```sql
alter table public.matches alter column tournament_id set not null;
```

To je čistejše od predlaganega `check (tournament_id is not null or group_id is
not null)`: podatki kažejo, da je `tournament_id` vedno prisoten, `group_id` pa
legitimno ni. `country_id` na `matches` ni potreben.

### Unique omejitve

Ključi, ki se nanašajo na nacionalni register, dobijo `country_id`:

- `users_emso_uniq` — pozor: to je **delni unique indeks**, ne constraint
  (`create unique index users_emso_uniq ... where emso is not null` iz
  `2026-07-09_users_emso_unique.sql`); odstrani se z `drop index`, ne z
  `drop constraint` → nadomesti ga delni indeks `unique (country_id, emso)`
- `clubs_name_lower_uniq` iz `2026-07-09_import_unique_constraints.sql` je
  globalen unique indeks na `lower(trim(name))` → postane
  `(country_id, lower(trim(name)))`, sicer prvi hrvaški klub z imenom
  slovenskega pade ob uvozu (podprojekt B)
- `league_teams_season_club_lower_uniq` iz iste datoteke je vezan na sezono in
  državo podeduje prek nje — ostane nespremenjen

EMŠO je slovenski konstrukt. Hrvaška uporablja številko iskaznice v obliki
`F922/98`. Zato `users` dobi splošen stolpec `registration_number text` za
nacionalno registrsko številko, z `unique (country_id, registration_number)`.
Obstoječi `emso` **ostane** kot ločen stolpec — vezan je na uvoz iz BZS Excela
in ga A1 ne premika. Za SI vrstice `registration_number` v A1 ostane prazen;
polni ga šele podprojekt B za HR.

#### Zakaj ne obstoječi `license_number` — preverjeno 2026-07-19

`users.license_number` že obstaja, zato je bilo treba preveriti, ali ni morda
ravno nacionalna registrska številka. **Ni.**

| | |
|---|---|
| uporabniki skupaj | 1176 |
| z `license_number` | 164 (14 %) |
| z `emso` | 906 |
| različnih vrednosti | 150 od 164 — **5 podvojenih** |

Oblike so nedosledne (maskirano, `9` = števka, `A` = črka): `9999` (47×), `999`
(26×), `99/9999` (22×), `9/999` (21×), `9/ 9999` (16×, **s presledkom sredi**),
`A99` (13×), `99`, `999/A`, `9-9-99/999`, in ena vrednost je **prazen niz**.

Odločilno: `unique (country_id, license_number)` bi ob uveljavitvi **padel**
zaradi petih podvojenih vrednosti. Gre za prostotekstno starino, ne za register.

`license_number` se torej v A1 **ne dotika** — ne preimenuje, ne omejuje, ne
migrira. Doda se ločen `registration_number`. Čiščenje ali opustitev
`license_number` je svoje delo, zunaj A1.

Opomba za pisanje omejitve: prazen niz ni `null`, zato ga `not null` ne ujame.
Če bo `registration_number` kdaj obvezen, potrebuje tudi `check (length(trim(...)) > 0)`.

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

**Brez predpone ostanejo** `/prijava`, `/registracija` in `/profil`. Račun je
oseba, ne država.

**Admin poti** (`/admin/*`) ostanejo brez predpone v poti, a **niso brez
konteksta države** — admin zaslon mora vedeti, čigave podatke ureja. Državo
dobijo iz `admin_country_id` prijavljenega uporabnika (glej razdelek o admin
pravicah). Za `super_admin`, ki ima dostop do vseh, je v admin glavi preklopnik
države; njegova izbira gre v isti `CountryProvider` kot javni del.

### Domenska preslikava

Domena in baza nista ista odločitev. `bocanje.top` lahko kaže na **isto
namestitev in isto bazo**, pri čemer domena določi državo: obiskovalec pride na
`bocanje.top/liga` in je v hrvaškem prostoru, z lastnim imenom in logotipom, ne
da bi videl slovensko vsebino.

`CountryProvider` zato razreši državo iz dveh virov, po prednosti:

1. **Domena**, če je preslikana (`bocanje.top` → `hr`). Predpona poti se v tem
   primeru ne uporablja — `bocanje.top/liga`, ne `bocanje.top/hr/liga`.
2. **Prvi segment poti** na privzeti domeni (`balinar.app/hr/liga`).

Preslikava domena → koda države je konfiguracija, ne trdo kodirano. Vsaka država
ima lahko svojo domeno ali pa nobene.

To da hrvaški zvezi lastno stran brez cene, ki jo prinese fork kode.

## Filtriranje poizvedb

Ločiti je treba tri primere. Prvotna različica tega speca je trdila, da država
sploh ni varnostna meja; to drži le za branje javnih podatkov.

| Primer | Varnostna meja? | Uveljavljanje |
|---|---|---|
| Branje javnih podatkov (lestvice, rezultati, rosterji) | ne | filter v aplikaciji |
| Branje osebnih podatkov (EMŠO, naslovi, kontakti) | **da** | RLS po državi |
| Pisanje (sezone, zapisniki, uvoz) | **da** | RLS po državi |

### Branje javnih podatkov

Lestvice, rosterji in rezultati so javni. Pomešanje SI in HR je napaka v
pravilnosti, ne vdor. Zato se **ne** uveljavlja prek RLS: RLS bi moral vedeti,
katero državo uporabnik trenutno gleda, kar pomeni tihotapljenje stanja UI v JWT
ali glave zahtevka — mehanika, ki ne varuje ničesar in bi se ob prvem
mednarodnem turnirju (ki mora videti obe državi hkrati) obrnila proti nam.

Namesto tega filtriranje v aplikaciji, s tremi zaščitami:

1. **Filtriranje samo na koreninah.** Poizvedbe na sedem korenskih tabel dobijo
   `.eq('country_id', countryId)`. Otroci ga ne rabijo — dostopni so prek
   filtriranega starša. Od ~180 klicnih mest se jih spremeni približno 55.
2. **Ozek pomožni sloj.** `fromCountry(table, countryId)`, ki filter doda sam.
   Ni abstrakcija čez Supabase — samo ta en zavoj, samo za teh sedem tabel.
3. **Test, ki lovi pozabljene.** Preišče `src/` in `api/` za surovimi
   `.from('clubs')` in ostalimi šestimi ter pade, če niso šli skozi pomožno
   funkcijo. Teče v CI. To drži disciplino čez čas — ob dodajanju Srbije se
   nihče ne bo spomnil tega dokumenta.

**Skripte za uvoz** v `scripts/` in `api/` ne gredo skozi UI kontekst, zato
morajo državo dobiti kot **izrecen argument, brez privzetka**. Skripta, ki
privzame Slovenijo, je natanko tista, ki bo hrvaške igralce nekoč vpisala v
slovenski register.

## Admin pravice, vezane na državo

Hrvaško bo predvidoma vodil nekdo iz HBS. To ustvari resnično organizacijsko
mejo, ki je danes ni.

**Stanje danes:** `20260628_restrict_users_pii_from_anon.sql` odvzame `anon`
dostop do občutljivih stolpcev `users` (emso, email, phone, naslov, kraj in
država rojstva, državljanstvo). Toda **vsak admin vidi vse osebne podatke vseh
uporabnikov.** Ko dobi oseba iz HBS admin vlogo, bere EMŠO, naslove in telefone
slovenskih igralcev.

To ni le neurejeno. Slovenski igralec je te podatke dal Balinarski zvezi
Slovenije; njihov dostop hrvaškemu administratorju je obdelava brez pravne
podlage.

### Model

`users.role` ne zadošča več — `admin` mora postati admin *določene države*.

- `users.admin_country_id uuid references countries(id)` — smiseln le pri
  `role = 'admin'`; pri `player` in `super_admin` je `null`.
- `super_admin` ostane brez omejitve (skrbnik platforme).
- Če se kdaj pojavi admin za dve državi, se stolpec zamenja z vezno tabelo. Za
  zdaj to ni potrebno in vezna tabela bi bila predčasna.
- **Zapolnitev ob uvedbi:** ista migracija, ki doda stolpec, nastavi
  `admin_country_id = SI` vsem obstoječim računom z `role = 'admin'` — vsi
  današnji admini so slovenski. Brez te zapolnitve bi nova politika (za
  `role = 'admin'` zahteva `admin_country_id = country_id` vrstice) vsem
  obstoječim adminom takoj zavrnila vsako pisanje: primerjava z `null` nikoli
  ne uspe.

### RLS politike

Obstoječe admin politike **niso enotne oblike in ne enotnih imen** — `clubs`
ima `"Admin urejanje"` z `role = any(array['admin','super_admin'])`
(`01_out_of_band_schema.sql`), `tournaments` in `league_seasons` imata
`"Admin pisanje turnirji"` / `"Admin pisanje liga"` z `auth.uid() in
(select ...)` (`00_schema.sql`), `tournament_series` ima `"Admin pisanje
serije"`, `guest_players` ima `"Admin ureja goste"`; `calendar_events` in
`users` v repu admin politike za pisanje sploh nimata (morebitna obstaja mimo
repa — isti zdrs shema/baza kot pri Koraku 0). Migracija zato politik **ne
odstranjuje po predpostavljenem imenu**, temveč po dejanskih imenih iz
`pg_policies`, in jih nadomesti tako, da `admin` velja le, kadar se
`admin_country_id` ujema s `country_id` vrstice:

- **Pisanje** na sedmih korenskih tabelah — neposredna primerjava.
- **Pisanje** na otrocih — primerjava prek starša (`league_teams` prek
  `league_seasons` itd.). Otroci imajo danes svoje, državno slepe admin
  politike (`"Admin pisanje matches"`, `"Admin write"` na
  `league_match_results` ipd.) — tudi te se zamenjajo v isti migraciji, sicer
  meja na koreninah ne pomeni nič: surov PostgREST klic piše naravnost po
  otroku.
- **Branje PII stolpcev `users`** — admin dostopa do občutljivih stolpcev le za
  svojo državo. Uporabnik še naprej vidi lasten profil v celoti. Pogled
  (`users_sensitive`) sam po sebi te meje **ne** vzpostavi: vloga
  `authenticated` ima danes polne stolpčne pravice na `public.users` in
  permisivno `select using (true)` politiko, torej vsak prijavljeni bere EMŠO
  neposredno iz tabele mimo pogleda. Migracija mora občutljive stolpce
  odvzeti tudi `authenticated` (revoke + ponovni grant samo javnih stolpcev,
  po vzoru `20260628_restrict_users_pii_from_anon.sql`); lastni in admin
  dostop do občutljivih stolpcev teče izključno prek `users_sensitive`, kar
  pomeni tudi prilagoditev `AuthContext.fetchProfile` (danes `select('*')`).

Ta razširitev se piše skupaj z migracijo, ne kasneje: politika, ki jo je treba
"še zaostriti", ostane ohlapna.

### Kaj A1 tu ne vsebuje

Poln admin UI za več držav — izbirnik države v admin glavi za `super_admin`,
zaslon za dodeljevanje admin vlog po državah, prikaz trenutno urejane države.
A1 postavi shemo in politike, da meja obstaja od prvega dne, ko so v bazi
hrvaški podatki. UI pride, preden kdorkoli iz HBS dejansko dobi dostop.

## Migracija

Shema v repu in shema v bazi sta se že razšli — štiri tabele in PII stolpci na
`users` so obstajali mimo migracij, `01_out_of_band_schema.sql` jih je šele
dokumentiral, polni `db reset` še ni bil testiran. Zato se ta migracija **piše
po introspekciji produkcijske baze, ne po repu**.

**Korak 0.** Izpis dejanskih stolpcev in omejitev na sedmih korenskih tabelah,
primerjava s trditvami repa. Razhajanja se dokumentirajo, preden se karkoli
spremeni. Varnostna kopija prizadetih tabel (ista praksa kot `_bak_zapisnik_*`
pri prepisu liga zapisnika).

Delno že opravljeno 2026-07-19 — glej ugotovitve o `matches`, `license_number`
in unique omejitvah zgoraj (razrešene: `users_emso_uniq`,
`clubs_name_lower_uniq`, `league_teams_season_club_lower_uniq`). Odprt ostaja
popis PII stolpcev `users`.

**Korak 1.** `countries` + vsebina. Slovenija `is_active = true`; Hrvaška,
Srbija, Črna gora, BiH vpisane a `is_active = false`. Ne spremeni ničesar
obstoječega.

**Korak 2.** `country_id` kot **nullable** na sedmih tabelah + indeks na vsakem.

**Korak 3.** Zapolnitev: `update ... set country_id = <si> where country_id is
null`. Vsi obstoječi podatki so slovenski — to ni ugibanje.

**Korak 4.** Najprej **ponovna zapolnitev** (isti `update ... where country_id
is null` kot v koraku 3 — med korakoma aplikacija še vpisuje vrstice brez
`country_id`, `set default` pa obstoječih vrstic ne popravi; brez tega `set
not null` pade), šele nato `not null` + prehodni privzetek na SI za pisce, ki
stolpca še ne pošiljajo. Privzetek pade takoj, ko so pisci prevezani —
privzetek, ki ostane, je isti tihi tovornjak v napačno državo. Med pisce sodi
tudi **DB prožilec `handle_new_user`** (vstavi vrstico `users` ob vsaki
registraciji, brez `country_id` — `00_schema.sql` /
`20260628_security_hardening.sql`): preden privzetek pade, mora prožilec
državo nastavljati sam, sicer po odstranitvi privzetka **vsaka registracija
pade** na `not null`. V tem koraku tudi popravek unique omejitev.

Vsak korak je samostojno preklican.

**Vrstni red izdaje:** migracija (koraki 1–3) gre v produkcijo **pred** kodo.
Nullable stolpec, ki ga nihče ne bere, je neškodljiv; koda, ki bere stolpec, ki
ga še ni, ni.

## Preverjanje

**Nič slovenskega ne izgine.** Števci po sedmih korenskih tabelah in glavnih
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

**Admin meja dejansko drži.** Testni račun z `role = 'admin'` in
`admin_country_id = HR` mora:

- videti hrvaške javne podatke — da
- brati EMŠO ali naslov slovenskega igralca — **ne**, zavrnjeno na ravni baze,
  tudi z neposrednim `select` na `users`, ne le prek pogleda `users_sensitive`
- spremeniti slovensko sezono, zapisnik ali klub — **ne**, zavrnjeno na ravni baze
- pisati po slovenskih **otroških** tabelah (npr. `league_teams`,
  `league_match_results`) prek surovega PostgREST — **ne**
- narediti oboje za Hrvaško — da

To se preveri **neposredno proti bazi**, ne skozi UI. Politika, ki jo obide
skripta ali surov PostgREST klic, ni politika. `super_admin` mora ohraniti
dostop do obojega.

**Domenska preslikava.** Če je `bocanje.top` že nastavljen: obisk pokaže hrvaški
prostor brez predpone v poti, `balinar.app/hr` pa isto vsebino. Če domena še ni
kupljena, se preslikava preveri lokalno prek vnosa v `hosts` ali nastavitve
okolja.

**CI:** test iz razdelka o filtriranju, ki lovi nefiltrirane `.from()` na
koreninah.

## Zunaj obsega A1

- Kakršni koli hrvaški podatki ali scraper (B, C, D)
- Ločitev `players` od `auth.users` (A2)
- Poln admin UI za več držav (shema in politike so v A1, UI ne)
- Hrvaška vizualna podoba za `bocanje.top` — logotip, barve, ime. A1 postavi
  preslikavo domene, ne pa oblikovanja
- Nakup in DNS nastavitev domene `bocanje.top`
- Prevod vmesnika v hrvaščino — jezik je ločen od države; vmesnik ostane
  slovenski tudi na `/hr`
- Geolokacijsko zaznavanje države
- Mednarodni turnirji čez več držav
