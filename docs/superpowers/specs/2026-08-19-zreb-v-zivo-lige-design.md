# Žreb v živo — ligaški žreb (faza 1)

**Datum:** 19. 8. 2026
**Status:** v pregledu

## 1 · Namen

Žreb ligaških številk danes poteka fizično na BZS, nato nekdo številke natipka v
`LeagueAdmin` → zavihek Ekipe. Aplikacija žreba nima — pozna le njegov izid
(`league_teams.draw_number`, `group_label`) in preveri, ali je oblikovno veljaven.

Ta faza doda **obred žreba v živo**: ekipe se vlečejo ena za drugo na zaslonu,
izid je berljiv iz zadnje vrste dvorane in uporaben kot brskalnikov vir v OBS,
na koncu pa se z eno potrditvijo zapiše v bazo. Ročno tipkanje s tem odpade.

Hkrati nastane **skupni pogon**, na katerem bosta stali fazi 2 (žreb skupin
turnirja) in 3 (izločilni žreb). Pogon je zato zasnovan splošno, uporabljen pa
je v tej fazi samo za lige.

## 2 · Obseg

**V fazi 1:**

- pogon obreda `src/engines/zreb.ts` (splošen, brez I/O)
- ligaški prilagojevalnik: `flat`, `split`, `groups`
- zaslon `/zreb/liga/:seasonId` z delovnim in predstavitvenim načinom
- zapis izida v `league_teams` prek potrjenega predogleda

**Zunaj faze 1:** žreb skupin turnirja, izločilni žreb, spremljanje na daljavo
med obredom, spreminjanje sestave lige v tem zaslonu.

## 3 · Kaj že obstaja

| Kos | Kaj počne |
|---|---|
| `src/engines/berger.ts` | iz žrebanih številk 1..N sestavi razpored (Priloga B, `MAX_BERGER_TEAMS = 12`) |
| `src/engines/leagueGroups.ts` | `validateDraw` — 6 ekip na skupino, številke 1..6 brez podvojitev in vrzeli |
| `src/engines/leagueSplit.ts` | OBZ Nova Gorica, 10 ekip; faza 1 je navaden Berger |
| `league_teams.draw_number` | žrebana številka; `NULL` = žreb še ni opravljen |
| `league_teams.group_label` | `'A'`/`'B'`, samo `format='groups'` |
| `LeagueAdmin` | ročni vnos obojega |

Obred ne nadomešča ničesar od tega — napolni ista dva stolpca, le da jih ne
natipka človek.

## 4 · Enotni model

Vsi trije žrebi (liga, skupine, izločilni) imajo isto obliko: **udeleženec
izvleče številko, ta številka je njegovo mesto**. Pogon zato ne pozna lig; pozna
le opis žreba.

```ts
interface ZrebOpis {
  udelezenci: Udelezenec[]        // { id, ime, oznaka? }
  stevilke: number[]              // razpoložljive številke
  vnaprej: Record<string, number> // udeleženci z vnaprej določeno številko
  koraki: Korak[]                 // vrstni red žrebanja
}

interface Korak {
  naziv: string                   // izpiše se nad gumbom
  udelezenci: string[]            // id-ji, ki se žrebajo v tem koraku
  veljavne(stanje, udelezenecId): number[]   // katere številke sme dobiti
}
```

`veljavne` je edina točka, kjer živijo pravila posameznega tekmovanja. Za lige
vrne preprosto vse preostale številke koraka; pri izločilnem žrebu bo isti
odtis nosil pravila o partnerskih in blokiranih številkah.

Stanje je nespremenljivo in serializabilno (`{ dodeljene, preostale, korak,
cakajoca, dnevnik }`). Razveljavljanje je odvzem s sklada prejšnjih stanj —
enako kot pri aplikaciji za Pokal BZS.

Naključje se vbrizga (`randInt(n)`), da so testi ponovljivi. V brskalniku je to
`crypto.getRandomValues` z zavrnitvenim vzorčenjem.

## 5 · Ligaški prilagojevalnik

Ligaški žreb ima **dve obliki**, ne tri:

### 5.1 `flat` in `split` — številke 1..N

Ena skupina, `N` = število ekip sezone (2..12; pri `split` vedno 10). Vsaka
ekipa izvleče eno številko iz 1..N, brez omejitev — v round robinu se srečajo
vsi, zato številka določa le vrstni red kol in domačo stran. Pri lihem `N`
Berger uporabi tabelo `N+1` in najvišja številka počiva; to je stvar
`bergerSchedule`, ne žreba.

Zapis: `league_teams.draw_number`.

### 5.2 `groups` — nosilska razporeditev v A/B, nato številke 1..6

Dve skupini po 6. Razporeditev v skupini **ni žrebana** — določi jo lanski
vrstni red po kačjem ključu, da sta skupini enakovredni:

```
mesto 1 → A    mesto 5 → A    mesto  9 → A
mesto 2 → B    mesto 6 → B    mesto 10 → B
mesto 3 → B    mesto 7 → B    mesto 11 → B
mesto 4 → A    mesto 8 → A    mesto 12 → A
```

Žreb nato znotraj vsake skupine določi številko 1..6. Obred ima torej dva
koraka: najprej šest ekip skupine A, nato šest skupine B.

Zapis: `league_teams.group_label` in `draw_number`.

**Lestvica kot vhod.** Zaslon pred začetkom pokaže rangirani seznam ekip in
zahteva potrditev. Če v aplikaciji obstaja prejšnja sezona iste lige, je seznam
vnaprej izpolnjen z njeno končno lestvico; sicer ga admin uredi ročno. Vrstni
red je viden ves čas obreda, da je razporeditev v A/B preverljiva.

## 6 · Potek obreda

Dvotaktno, kot pri pokalu: **izvleci ekipo → izvleci številko**.

1. Zaslon naloži ekipe sezone in (pri `groups`) rangirani seznam.
2. Admin potrdi izhodišče. Pri `flat` in `split` je to le pregled ekip in
   razpona številk; pri `groups` je to potrditev lestvice in iz nje izpeljane
   razporeditve v A/B. **Od te potrditve naprej zaslon ne pošlje nobene
   zahteve** — vse do koraka 5.
3. Gumb se izmenjuje med *Izvleci ekipo* in *Izvleci številko*.
4. **Razveljavi** deluje poljubno globoko nazaj; **Ponastavi** zahteva potrditev.
5. Ko so vse ekipe izžrebane, gumb **Zapiši v bazo** pokaže predogled vrstic, ki
   bodo posodobljene, in šele potrditev piše.

Stanje se po vsaki potezi shrani v `localStorage` pod ključem, ki vsebuje
`seasonId`. Ob ponovnem odprtju zaslon ponudi nadaljevanje.

## 7 · Zapis v bazo

Edini kos z I/O je `src/lib/zrebShrani.ts`:

```ts
naloziLigaskiZreb(seasonId): Promise<ZrebOpis + izhodišče>
shraniLigaskiZreb(seasonId, izid): Promise<void>
```

Zapis je posodobitev `draw_number` (in pri `groups` `group_label`) za vsako
ekipo. Pred zapisom se izid spusti skozi `leagueGroups.validateDraw` (pri
`groups`) oziroma skozi enakovredno preverbo 1..N (pri `flat`/`split`); ob
napaki se ne zapiše nič.

Zapis **ne** ustvarja razporeda. Razpored še naprej naredi admin z obstoječim
gumbom, ko je žreb v bazi — obred in generiranje ostaneta ločena, ker sta
ločena tudi danes.

Ker razvojne baze ni (`CLAUDE.md`), je celoten obred do zadnje potrditve
neškodljiv: bere ob odprtju, piše samo na izrecen klik.

## 8 · Zaslon

Ena stran, dva načina, preklop z gumbom in tipko `P`.

**Delovni:** levo veliki gumb z izpisom ekipe in številke, sredina seznam ekip s
številkami, desno preostale številke in dnevnik potez. Spodaj *Razveljavi*,
*Ponastavi*, *Zapiši v bazo*.

**Predstavitveni:** samo ime ekipe in njena številka, čez cel zaslon, plus
majhen seznam že izžrebanih. Fiksna postavitev 1920×1080, možnost prosojnega
ozadja prek `?ozadje=prosojno` za brskalnikov vir v OBS.

Predstavitveni način je **isti zaslon in isto stanje**, le drugače izrisano, in
se vodi s tipkovnico: preslednica izvleče naslednje, `Z` razveljavi, `P` preklopi
nazaj. Ni drugega okna.

To je zavestna omejitev. Ločeno okno za občinstvo in ločeno za komisijo bi
zahtevalo usklajevanje stanja med okni (`BroadcastChannel`), kar je nov razred
napak sredi dogodka v živo. Pri zrcaljenem ali podvojenem zaslonu — kar je
običajna postavitev s projektorjem — en zaslon zadošča. Ločeni pogled za
občinstvo pride v poštev šele, če se v praksi izkaže za potrebnega.

## 9 · Invariante

Pogon jih preveri po vsaki potezi in ob kršitvi vrže napako; zaslon jo pokaže in
ustavi obred, namesto da bi izpeljal neveljaven žreb.

1. Vsaka ekipa ima natanko eno številko; vse različne.
2. Nobena številka ni zunaj razpoložljivih.
3. Ob koncu so dodeljene vse številke koraka, brez vrzeli.
4. Pri `groups`: natanko 6 ekip na skupino in številke 1..6 v vsaki.
5. Razporeditev v A/B ustreza kačjemu ključu iz potrjene lestvice.

## 10 · Testiranje

Po pravilu iz `CLAUDE.md` gre vsako novo pravilo v `src/engines/` in dobi test.

- `zreb.test.ts` — lastnostni test: 10 000 celotnih žrebov na obliko, pri vsakem
  preverjene vse invariante; ter robni primeri (razveljavljanje po obeh vrstah
  poteze, nadaljevanje iz shranjenega stanja, `N` liho/sodo, `N=2`, `N=12`).
- test, da je izid **sprejemljiv za obstoječo kodo**: naključni izid žreba gre
  skozi `leagueGroups.validateDraw` brez napak in skozi `bergerSchedule` /
  `bergerFixtures` brez izjeme.
- test kačjega ključa proti ročno zapisani tabeli iz razdelka 5.2.

Zagon: `npm test -- --run`. `npm run typecheck` mora ohraniti število napak
(7. 8. 2026 jih je na `main` 26 v 11 datotekah).

## 11 · Predpostavke, ki jih je treba potrditi

1. **Kačji ključ.** Razdelek 5.2 predpostavlja zaporedje A-B-B-A. Če zveza
   uporablja preprosto izmenjavanje (A-B-A-B) ali kaj tretjega, se spremeni le
   ta tabela.
2. **Vir lanske lestvice.** Predvideno je samodejno polnjenje iz prejšnje sezone
   iste lige, kadar obstaja, sicer ročni vnos. Če se lestvica vodi drugje,
   ostane ročni vnos edina pot.
3. **Kdo sme žrebati.** Predvideno je, da zaslon zahteva vlogo `admin` ali
   `super_admin`, enako kot `LeagueAdmin`.
4. **Ena sezona naenkrat.** Obred predpostavlja, da se en žreb izvaja za eno
   sezono; vzporedni žrebi dveh lig na istem računalniku niso predvideni.

## 12 · Naslednji fazi

**Faza 2 — žreb skupin turnirja.** Isti pogon; prilagojevalnik prevede
`tournament_registrations` v udeležence in `tournament_groups` × mesta v
številke, izid pa zapiše prek obstoječe poti v `group_teams`.

**Faza 3 — izločilni žreb.** Isti pogon; številke so mesta v mreži, `veljavne`
nosi pravila o blokiranih in partnerskih številkah, izid gre v
`insertKnockoutBracket`. Sem sodi tudi različica s fiksnimi številkami nosilcev
in prostimi mesti, kot jo uporablja Pokal BZS.
