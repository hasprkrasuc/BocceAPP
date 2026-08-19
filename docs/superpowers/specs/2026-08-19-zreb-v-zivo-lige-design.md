# Žreb v živo — ligaški žreb (faza 1)

**Datum:** 19. 8. 2026
**Status:** v pregledu (druga različica — popravljena pravila skupin in igrišč)

## 1 · Namen

Žreb ligaških številk danes poteka fizično na BZS, nato nekdo številke natipka v
`LeagueAdmin` → zavihek Ekipe. Aplikacija žreba nima — pozna le njegov izid
(`league_teams.draw_number`, `group_label`) in preveri, ali je oblikovno veljaven.

Ta faza doda **obred žreba v živo**: ekipe se vlečejo ena za drugo na zaslonu,
izid je berljiv iz zadnje vrste dvorane in uporaben kot brskalnikov vir v OBS,
na koncu pa se z eno potrditvijo zapiše v bazo. Ročno tipkanje s tem odpade.

Hkrati nastane **skupni pogon**, na katerem bosta stali fazi 2 (žreb skupin
turnirja) in 3 (izločilni žreb).

## 2 · Obseg

**V fazi 1:**

- pogon obreda `src/engines/zreb.ts` (splošen, brez I/O)
- ligaški prilagojevalnik: `flat`, `split`, `groups`
- pravilo o skupnih rezervnih igriščih, vključno z novim stolpcem in migracijo
- zaslon `/zreb/liga/:seasonId` z delovnim in predstavitvenim načinom
- zapis izida v `league_teams` prek potrjenega predogleda

**Zunaj faze 1:** žreb skupin turnirja, izločilni žreb, spremljanje na daljavo
med obredom, urejanje sestave lige v tem zaslonu.

## 3 · Kaj že obstaja

| Kos | Kaj počne |
|---|---|
| `src/engines/berger.ts` | iz žrebanih številk 1..N sestavi razpored (Priloga B, `MAX_BERGER_TEAMS = 12`) |
| `src/engines/leagueGroups.ts` | `validateDraw` — 6 ekip na skupino, številke 1..6 brez podvojitev in vrzeli |
| `src/engines/leagueSplit.ts` | OBZ Nova Gorica, 10 ekip; faza 1 je navaden Berger |
| `league_teams.draw_number` | žrebana številka; `NULL` = žreb še ni opravljen |
| `league_teams.group_label` | `'A'`/`'B'`, samo `format='groups'` |
| `LeagueAdmin` | ročni vnos obojega |

Skupnih igrišč aplikacija **ne pozna** — `league_fixtures.venue` je prosto
besedilo na tekmo, `leaguePlaygrounds.ts` pa dodeljuje steze disciplinam znotraj
tekme in s tem nima zveze.

## 4 · Enotni model

Vsi trije žrebi (liga, skupine, izločilni) imajo isto obliko: **udeleženec
izvleče številko, ta številka je njegovo mesto**. Pogon ne pozna lig; pozna le
opis žreba.

```ts
interface ZrebOpis {
  udelezenci: Udelezenec[]        // { id, ime, oznaka? }
  koraki: Korak[]                 // zaporedne faze obreda
}

interface Korak {
  naziv: string                   // izpiše se nad gumbom
  udelezenci: string[]            // id-ji, ki se žrebajo v tem koraku
  stevilke: number[]              // razpoložljive številke tega koraka
  veljavne(stanje, udelezenecId): number[]
  posledice(stanje, udelezenecId, stevilka): Dodelitev[]  // samodejne dodelitve
}
```

`veljavne` in `posledice` sta edini točki, kjer živijo pravila tekmovanja.
`posledice` pokrije primere, ko en poteg določi še koga drugega — pri ligah sta
to sopostavljeni nosilec in soigriščna ekipa.

Stanje je nespremenljivo in serializabilno (`{ dodeljene, preostale, korak,
cakajoca, dnevnik }`). Razveljavljanje je odvzem s sklada prejšnjih stanj.
Naključje se vbrizga (`randInt(n)`); v brskalniku je to `crypto.getRandomValues`
z zavrnitvenim vzorčenjem.

## 5 · Ligaški prilagojevalnik

### 5.1 Dve obliki, ne tri

`flat` in `split` sta za žreb enaka: ena skupina, številke 1..N. Pri `split` je
`N = 10` in faza 1 je navaden Berger. Ločeno obravnavo potrebuje le `groups`.

### 5.2 `groups` — najprej skupini, šele nato številke

Obred ima **dve fazi**.

**Faza A — razporeditev v skupini.** Ekipe so razvrščene po nosilnem vrstnem
redu (lanska lestvica) in obravnavane v parih: 1. in 2., 3. in 4., 5. in 6., in
tako naprej do 11. in 12.

Za vsak par se žreba **samo prvi nosilec** — izvleče A ali B. Drugi iz para se
samodejno postavi v nasprotno skupino. Tako je zagotovljeno, da sta zaporedna
nosilca vedno ločena in sta skupini enakovredni.

Razporeditev ni fiksna tabela; vsakič se žreba znova.

**Faza B — številke.** Šele ko sta skupini znani, se žrebajo številke 1..6
znotraj vsake skupine posebej.

### 5.3 Skupna rezervna igrišča

Dve ekipi si lahko delita rezervno igrišče. Takrat **ne smeta biti nikoli obe
domači v istem krogu**, sicer igrišče ne zadošča.

To zagotavlja razlika med njunima žrebanima številkama. Preverjeno na
Bergerjevih tabelah iz `berger.ts`, dvokrožno:

| Ekip v naboru | Veljavne razlike |
|---|---|
| 6 | 3 |
| 8 | 4 |
| 10 | 5 |
| 12 | 6 |
| 7 | 3 ali 4 |
| 9 | 4 ali 5 |
| 11 | 5 ali 6 |

Pri sodem N je to natanko `N/2`, pri lihem `N/2` navzdol ali navzgor.
`berger_mirror` na to ne vpliva. Razlika 3, kot se navadno navaja, je pravilna
samo za skupino šestih.

**Motor razlike ne bo imel vkodirane.** Funkcija
`veljavniPariIgrisc(n, dvokrozno, mirror)` jo izpelje iz `bergerSchedule` tako,
da poišče pare številk, ki v nobenem krogu nista obe domači. S tem sodo/liho
število ekip, eno- ali dvokrožnost in zrcaljenje odpadejo kot posebni primeri, in
pravilo se ne more razhajati z razporedom, ki ga aplikacija dejansko ustvari.

**Kako poteka žreb takega para.** Žreba se le ena od obeh ekip. Ko izvleče
številko `n`, druga **samodejno** dobi partnersko številko — enako načelo kot pri
sopostavljenem nosilcu v fazi A. Če je veljavnih partnerskih številk več (liho
`N`) in sta prosti obe, se med njima žreba.

**Soigriščni pari se žrebajo prvi.** To ni kozmetika, ampak pogoj za
izvedljivost. Če bi ekipe brez omejitve žrebale prve, bi lahko zasedle številke
tako, da za par ne bi ostala nobena veljavna razlika — pri skupini šestih na
primer zadošča, da nekdo vzame 1, 2 in 3, paru pa ostanejo 4, 5 in 6 z razlikama
1 in 2. Žreb bi se zataknil sredi obreda.

Faza B ima zato dva podkoraka: najprej vsi soigriščni pari, nato preostale ekipe
brez omejitev. Ker je v naboru šestih na voljo natanko toliko veljavnih parov,
kolikor je razpolovljenih mest (3), je postavitev pri tem vrstnem redu vedno
rešljiva — dokler preverba iz razdelka 5.4 prepusti le pare in ne trojk.

**Nabor je odvisen od formata.** Pri `flat` in `split` je nabor cela liga, zato
razlika izhaja iz `N`. Pri `groups` je nabor posamezna skupina šestih, zato je
razlika 3 — in pravilo velja le, če sta ekipi po fazi A pristali v isti skupini.
Če sta v različnih skupinah, se nikoli ne srečata v istem razporedu in omejitve
ni.

### 5.4 Nov podatek: kdo si deli igrišče

Aplikacija tega ne ve, zato je potreben nov stolpec:

```sql
alter table public.league_teams
  add column if not exists shared_venue_key text;
comment on column public.league_teams.shared_venue_key is
  'Ekipe z enakim ključem si delijo (rezervno) igrišče in ne smeta biti obe domači v istem krogu. NULL = ekipa igrišča ne deli.';
```

Migracija po pravilih iz `CLAUDE.md`: `supabase/migrations/20260819_01_shared_venue_key.sql`,
idempotentno, uveljavi jo človek ročno. Ker stolpec le **dodaja**, gre lahko pred
deployem kode.

Vnos ključa je preprosto besedilno polje v `LeagueAdmin` → zavihek Ekipe.

**Preverba izvedljivosti pred obredom.** Ob nalaganju zaslon preveri, da ima vsak
ključ natanko dve ekipi in da je omejitev sploh rešljiva. Če si igrišče deli
troje ali več ekip, obred se ne začne in izpiše se razlog — bolje kot da se
zatakne sredi dvorane.

## 6 · Potek obreda

Dvotaktno: **izvleci ekipo → izvleci številko** (v fazi A: izvleci skupino).

1. Zaslon naloži ekipe sezone, pri `groups` še nosilni vrstni red, in izvede
   preverbo izvedljivosti iz razdelka 5.4.
2. Admin potrdi izhodišče. Pri `flat` in `split` je to pregled ekip, razpona
   številk in parov, ki si delijo igrišče; pri `groups` še potrditev lestvice.
   **Od te potrditve naprej zaslon ne pošlje nobene zahteve** — vse do koraka 5.
3. Gumb se izmenjuje glede na fazo. Samodejne dodelitve (sopostavljeni nosilec,
   soigriščna ekipa) se izpišejo takoj ob potegu, z razlogom.
4. **Razveljavi** deluje poljubno globoko nazaj; **Ponastavi** zahteva potrditev.
5. Ko so vse ekipe izžrebane, gumb **Zapiši v bazo** pokaže predogled vrstic, ki
   bodo posodobljene, in šele potrditev piše.

Stanje se po vsaki potezi shrani v `localStorage` pod ključem s `seasonId`. Ob
ponovnem odprtju zaslon ponudi nadaljevanje.

## 7 · Zapis v bazo

Edini kos z I/O je `src/lib/zrebShrani.ts`:

```ts
naloziLigaskiZreb(seasonId): Promise<{ opis: ZrebOpis, izhodisce: Izhodisce }>
shraniLigaskiZreb(seasonId, izid): Promise<void>
```

Zapis posodobi `draw_number` in pri `groups` `group_label`. Pred zapisom gre izid
skozi `leagueGroups.validateDraw` (pri `groups`) oziroma enakovredno preverbo
1..N, in skozi preverbo igriščnih parov. Ob napaki se ne zapiše nič.

Zapis **ne** ustvarja razporeda — tega še naprej naredi admin z obstoječim
gumbom, ko je žreb v bazi. Obred in generiranje ostaneta ločena, ker sta ločena
tudi danes.

Ker razvojne baze ni (`CLAUDE.md`), je celoten obred do zadnje potrditve
neškodljiv: bere ob odprtju, piše samo na izrecen klik.

## 8 · Zaslon

Ena stran, dva načina, preklop z gumbom in tipko `P`.

**Delovni:** levo veliki gumb z izpisom ekipe in izida, sredina seznam ekip s
skupinami in številkami, desno preostale številke in dnevnik potez. Spodaj
*Razveljavi*, *Ponastavi*, *Zapiši v bazo*.

**Predstavitveni:** ime ekipe in njen izid čez cel zaslon, plus majhen seznam že
izžrebanih. Fiksna postavitev 1920×1080, prosojno ozadje prek
`?ozadje=prosojno` za brskalnikov vir v OBS.

Predstavitveni način je **isti zaslon in isto stanje**, le drugače izrisano, in
se vodi s tipkovnico: preslednica izvleče naslednje, `Z` razveljavi, `P` preklopi
nazaj. Ni drugega okna.

To je zavestna omejitev. Ločeno okno za občinstvo bi zahtevalo usklajevanje stanja
med okni (`BroadcastChannel`), kar je nov razred napak sredi dogodka v živo. Pri
zrcaljenem zaslonu — običajni postavitvi s projektorjem — en zaslon zadošča.

## 9 · Invariante

Pogon jih preveri po vsaki potezi in ob kršitvi vrže napako; zaslon jo pokaže in
ustavi obred, namesto da bi izpeljal neveljaven žreb.

1. Vsaka ekipa ima natanko eno številko; znotraj nabora so vse različne.
2. Ob koncu so dodeljene vse številke nabora, brez vrzeli.
3. Pri `groups`: natanko 6 ekip na skupino in številke 1..6 v vsaki.
4. Pri `groups`: zaporedna nosilca iz istega para sta v različnih skupinah.
5. Ekipi z istim `shared_venue_key`, ki sta v istem naboru, imata razliko številk
   iz `veljavniPariIgrisc`.

## 10 · Testiranje

Po pravilu iz `CLAUDE.md` gre vsako novo pravilo v `src/engines/` in dobi test.

- `zreb.test.ts` — lastnostni test: 10 000 celotnih žrebov na obliko, pri vsakem
  preverjene vse invariante; robni primeri (razveljavljanje po obeh vrstah
  poteze, nadaljevanje iz shranjenega stanja, `N` liho in sodo, `N=2`, `N=12`,
  več igriščnih parov hkrati, neizvedljiva postavitev).
- **Test, da se žreb nikoli ne zatakne:** pri vsakem od 10 000 žrebov mora biti
  na vsakem koraku na voljo vsaj ena veljavna številka. Ta test bi ujel napako iz
  razdelka 5.3 — vrstni red podkorakov faze B — in je zato obvezen tudi pri
  največjem številu soigriščnih parov, ki jih nabor še dopušča.
- `veljavniPariIgrisc` proti ročno zapisani tabeli iz razdelka 5.3 — ta test je
  nosilni, ker se od njega odbija celotno pravilo o igriščih.
- **Test namena, ne le oblike:** za naključni izid žreba se sestavi razpored z
  `bergerSchedule` in preveri, da ekipi, ki si delita igrišče, v nobenem krogu
  nista obe domači. To preverja tisto, kar pravilo v resnici hoče doseči.
- izid gre skozi `leagueGroups.validateDraw` brez napak in skozi `bergerFixtures`
  brez izjeme.

Zagon: `npm test -- --run`. `npm run typecheck` mora ohraniti število napak
(7. 8. 2026 jih je na `main` 26 v 11 datotekah).

## 11 · Predpostavke, ki jih je treba potrditi

1. **Nosilni vrstni red za fazo A.** Predvideno je samodejno polnjenje iz končne
   lestvice prejšnje sezone iste lige, kadar obstaja, sicer ročni vnos. Vrstni red
   je viden ves čas obreda, da je parjenje preverljivo.
2. **Liho število ekip.** Pri lihem `N` sta veljavni dve razliki. Predvideno je,
   da se med njima žreba, kadar sta prosti obe. Če zveza predpisuje eno, se
   spremeni ena vrstica.
3. **Kdo sme žrebati.** Predvideno je `admin` ali `super_admin`, enako kot
   `LeagueAdmin`.
4. **Ena sezona naenkrat.**
5. **Ključ igrišča je nov podatek.** Nekdo ga mora vnesti za obstoječe sezone,
   sicer se pravilo ne uveljavi. Brez vnosa se obred izvede brez te omejitve.

## 12 · Naslednji fazi

**Faza 2 — žreb skupin turnirja.** Isti pogon; prilagojevalnik prevede
`tournament_registrations` v udeležence in `tournament_groups` × mesta v številke,
izid pa zapiše v `group_teams`.

**Faza 3 — izločilni žreb.** Isti pogon; številke so mesta v mreži, `veljavne`
nosi pravila o blokiranih in partnerskih številkah, izid gre v
`insertKnockoutBracket`. Sem sodi tudi različica s fiksnimi številkami nosilcev in
prostimi mesti, kot jo uporablja Pokal BZS.
