# Sodelovanje pri BalinarApp

Ta dokument opisuje pravila, ki jih **iz kode ni videti**, in past, ki bi jih
nov človek zanesljivo srečal. Postavitev okolja je v [README.md](README.md).

## Devet pravil, ki jih moraš poznati

### 1. Repozitorij je JAVEN — nikoli osebnih podatkov

Nikoli ne commitaj resničnih EMŠO, imen v povezavi z osebnimi podatki, naslovov
ali e-poštnih naslovov — ne v kodo, ne v teste, ne v fixture, ne v komentarje,
ne v opise PR. Uporabljaj sintetične podatke (`Testni sodnik`,
`test.nekaj@example.invalid`, klubi s predpono `ZZ Test`).

Klubska imena so javna in so v redu. **Osebe niso.**

### 2. Migracije se poganjajo ročno

Ni Supabase CLI, ni Dockerja, ni CI, ki bi migracije uveljavil. Vercel objavi
samo frontend. Postopek:

1. napiši `supabase/migrations/<datum>_<opis>.sql`
2. prilepi vsebino v Supabase SQL editor in poženi
3. commitaj datoteko, da repo ostane usklajen z bazo

Ker je korak ročen, **datoteko na različnih vejah ni dovolj popraviti** — če si
migracijo že pognal in jo nato spremeniš, bo v bazi stara različica. Ob popravku
migracije raje preimenuj datoteko ali izrecno preveri, katera različica je bila
pognana. To se je že zgodilo in je pustilo podvojene politike.

### 3. Vrstni red kode in migracije je pomemben

Migracija, ki **odvzame** pravico, mora priti **za** deployem kode, ki te
pravice ne potrebuje več. Migracija, ki **doda** stolpec ali pogled, mora priti
**pred** kodo, ki ga uporablja.

Če potrebuješ oboje hkrati, razbij na dva koraka (expand/contract): najprej
dodaj, deployaj kodo, šele nato odvzemi. Primer je v
`2026-07-29_users_birth_year_1_add.sql` in `_2_restrict.sql`.

### 4. `select('*')` na `users` odpove

Vloga `authenticated` ima na `public.users` bralno pravico samo za javne
stolpce, ki so našteti v `src/lib/userColumns.ts` (`USER_PUBLIC_COLS`).

```ts
// PADE: permission denied
supabase.from('users').select('*')

// PADE tudi to — RETURNING * po update
supabase.from('users').update({ ... }).eq('id', id).select()

// Prav:
supabase.from('users').select(USER_PUBLIC_COLS)
supabase.from('users').update({ ... }).eq('id', id).select('id, full_name')
```

Občutljivi stolpci (EMŠO, e-pošta, telefon, naslov, poln datum rojstva, licenca)
so dostopni prek pogleda `users_sensitive`, ki vrne lasten profil ali — če si
admin — vse vrstice.

### 5. Vloge se menjajo samo prek `set_user_role()`

RLS na `users` dovoljuje pisanje **samo po lastni vrstici**. Neposreden
`update({ role })` za tujega uporabnika zato ujame nič vrstic in PostgREST to
vrne kot **uspeh** — sprememba se tiho ne zgodi.

```ts
await supabase.rpc('set_user_role', { target_id: userId, new_role: role })
```

Vlogo `super_admin` sme podeliti ali odvzeti le super_admin.

### 6. Po vsaki spremembi RLS poženi regresijski test

```bash
node scripts/check-rls-regression.cjs
```

Preveri matriko vlog neposredno proti bazi, mimo UI — anon, igralec, sodnik in
admin, skupaj 33 preverb.

Potrebuje **tri** vrednosti; skripta jih poišče v `scripts/.env.local` ali v
korenskem `.env.local` (sprejme `ANON_KEY` ali `VITE_SUPABASE_ANON_KEY`):

```
SUPABASE_URL=...
SERVICE_ROLE_KEY=...
ANON_KEY=...
```

`SERVICE_ROLE_KEY` obide vso RLS zaščito, zato ga novinec praviloma nima —
zaprosi zanj lastnika projekta ali ga vzemi iz Supabase Dashboarda pod svojim
računom.

**Skripta piše v bazo.** Ustvari sezono, dve ekipi, tekmi, disciplino, turnir,
prijavo in tri uporabniške račune, vse s predpono `ZZ Test` oz. na
`@example.invalid`, in vse na koncu pobriše. Ker razvojne baze ni (glej
[README](README.md)), to pomeni pisanje v **produkcijo** — poganjaj jo premišljeno
in nikoli med tekmovanjem.

Najbolj kritična je vrstica **sodnik**: politiki za zapisnik in discipline sta
tisti, ki med tekmovanjem dejansko delujeta. Zapisnik se ob shranjevanju najprej
**pobriše** in vpiše znova, zato mora sodnik imeti tudi pravico brisanja.

### 7. Realtime: posodobi iz payloada, ne nalagaj vsega znova

Vzorec `postgres_changes → load()` je bil odstranjen in se **ne vrača**. En vpis
rezultata je sprožil poln refetch pri vseh gledalcih hkrati — pri 150 gledalcih
600 sočasnih poizvedb proti bazi s 60 povezavami.

Uporabi `src/lib/useRealtimeTable.ts`:

- `UPDATE` se obdela iz payloada z `mergeRowById` — nič dodatnih poizvedb
- `INSERT`/`DELETE` gresta skozi refetch z zamikom in **naključnim raztezkom**
- naročnina miruje, ko zavihek ni viden

Payload nosi samo stolpce tabele. Ugnezdenih embedov (`home_team`, `team_a`) v
njem ni — zato jih `mergeRowById` ohrani in vrstice ne zamenja.

### 8. Velikost odgovorov je pomembnejša od števila povezav

Izmerjeno pri 300 hkratnih uporabnikih: ozko grlo ni bila baza (zasedenih 18 od
60 povezav), ampak velikost odgovorov. Iste poizvedbe z ožjimi stolpci: p95 s
3,34 s na 110 ms.

Zato ne vgnezdi tega, kar je že naloženo. Razpored v `League.tsx` ekipe pripne
po `id`-ju iz seznama, ki je že v pomnilniku, namesto da bi jih embed prinesel
160-krat za devet ekip.

### 9. `scripts/` je v .gitignore

Mapa je izvzeta, ker vsebuje `.env.local` s service-role ključem. Posamezne
skripte so v gitu vsiljene z `git add -f`:

```bash
git add -f scripts/mojaskripta.cjs
```

Vsiljena posamezna datoteka ne razveljavi pravila za mapo — `.env.local` ostane
neizsleden. **Nikoli** ne dodajaj cele mape.

## Testi

Testira se **čista logika**: `src/engines/` (razporedi, lestvice, statistika) in
del `src/lib/`. Za React komponente testov ni — `jsdom` in `testing-library`
nista nameščena in ju ne dodajamo mimogrede.

Če pišeš tekmovalno pravilo, ga izloči v čisto funkcijo in mu napiši test. Če
pišeš UI, ga preveri v brskalniku.

```bash
npm test -- --run
```

Trenutno stanje: 262 testov v 22 datotekah.

## Pred oddajo PR

```bash
npm test -- --run && npm run typecheck && npm run typecheck:api && npm run build
```

Na Windows PowerShell 5.1 (privzeta lupina na Win 11) `&&` **ne obstaja** in
zgornja vrstica javi `ParserError`. Uporabi Git Bash ali:

```powershell
npm test -- --run; if ($?) { npm run typecheck }; if ($?) { npm run typecheck:api }; if ($?) { npm run build }
```

Dvoje, kar je vredno vedeti:

- `typecheck` javi **17 napak** — obstoječe stanje na `main`. Pomembno je le, da
  tvoja sprememba tega števila ne poveča. Preštej pred in po.
- `npm run build` **tipov ne preverja**, zato uspešen build in zelen deploy ne
  povesta ničesar o TypeScriptu. Typecheck je ločen korak in ga ne preskoči.

Če si se dotaknil RLS ali pravic, dodaj še `node scripts/check-rls-regression.cjs`.

Lint koraka ni — ESLint in Prettier v projektu nista nameščena. Slog povzemaj po
okoliški kodi.

## Konvencije

**Veje:** `feat/…`, `fix/…`, `perf/…`, `sec/…`, `docs/…`

**Commiti:** conventional commits s slovenskim besedilom. Sporočilo naj pove
*zakaj*, ne le *kaj* — zakaj je bila prejšnja rešitev napačna in kaj bi se
zgodilo, če je ne popravimo.

```
perf(liga): razpored brez vgnezdenih ekip -- polovica manj prenosa
```

**Merge:** squash, s številko PR v naslovu (`(#81)`).

**Jezik:** koda, komentarji, sporočila commitov in vmesnik so v slovenščini.
Angleščina se pojavlja le v starejših delih; novih ne dodajamo.
