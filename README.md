# BalinarApp

Spletna aplikacija za vodenje balinarskih tekmovanj — državne lige, turnirji in
prvenstva, statistika in rang lestvica. V produkciji teče na
[balinar.app](https://balinar.app).

Koda, komentarji, sporočila commitov in vmesnik so v slovenščini.

## Tehnologija

| | |
|---|---|
| Frontend | React 18 + TypeScript, Vite 5 |
| Usmerjanje | react-router-dom v6 |
| Podatki | Supabase (PostgreSQL + PostgREST + RLS + Realtime) |
| Slog | Tailwind CSS 3 |
| Testi | Vitest (okolje `node`, brez DOM) |
| Objava | Vercel (statični build + serverless funkcije v `api/`) |

Poizvedbe gredo **neposredno prek `supabase-js` v `useEffect`** — 147 klicev
`supabase.from()` v 32 datotekah. TanStack Query je sicer nameščen in
`QueryClientProvider` je vgrajen v [App.tsx](src/App.tsx), a se za poizvedbe
(še) ne uporablja; `useQuery` v kodi ni nikjer.

## ⚠️ Preden začneš: razvojne baze ni

`.env.local` kaže na **produkcijski** Supabase projekt. Ni ločenega staging
okolja, ni lokalne baze (`supabase/` vsebuje samo `migrations/`, brez
`config.toml`, in Supabase CLI ni v rabi).

To pomeni, da **lokalni razvoj piše v živo bazo**, ki jo uporablja balinar.app.
Pri delu z obrazci, uvozi in admin zasloni to upoštevaj: uporabljaj sintetične
zapise s predpono `ZZ Test` in jih za sabo pobriši. Preden se lotiš česarkoli,
kar piše v bazo, se dogovori z lastnikom projekta.

## Postavitev

```bash
git clone https://github.com/hasprkrasuc/BocceAPP.git
cd BocceAPP
npm install
cp .env.example .env.local     # nato izpolni obe vrednosti
npm run dev
```

Dev strežnik teče na `http://localhost:5173`.

Za `.env.local` potrebuješ `VITE_SUPABASE_URL` in `VITE_SUPABASE_ANON_KEY` —
dobiš ju od lastnika projekta oziroma v Supabase Dashboardu pod **Project
Settings → API**. Anon ključ je javen in ga varuje RLS, zato ga je varno
deliti. Brez njiju se aplikacija ob zagonu ustavi z jasno napako
([src/supabase.ts](src/supabase.ts)).

**Node 20 ali novejši.** Projekt nima `engines`, a Vitest 4 zahteva
`^20 || ^22 || >=24`; na Node 18 `npm install` javi `EBADENGINE` in testi ne
tečejo. Razvija se na Node 24.

### Dostop do admin dela

Nova registracija dobi vlogo `player`, admin poti (`/admin/*`) pa so za takega
uporabnika nedosegljive — `ProtectedRoute` ga preusmeri na domačo stran. Za
delo na admin zaslonih prosi obstoječega `super_admin`, da ti prek
**/admin/uporabniki** dvigne vlogo na `admin`.

### Kaj `npm run dev` ne postreže

Vite streže samo frontend. Serverless funkcije v `api/` **ne tečejo** —
`vite.config.ts` nima proxyja, zato `fetch('/api/import-players')` iz
[PlayerImport.tsx](src/pages/admin/PlayerImport.tsx) lokalno vrne 404. Za delo
na njih potrebuješ `npx vercel dev` in `vercel link`, funkcija pa poleg tega
bere `SUPABASE_URL` in `SUPABASE_SERVICE_ROLE_KEY` iz okolja.

## Ukazi

| Ukaz | Kaj naredi |
|---|---|
| `npm run dev` | razvojni strežnik, `localhost:5173` (brez `/api`) |
| `npm run build` | produkcijski build v `dist/` |
| `npm run preview` | lokalni ogled zgrajenega builda |
| `npm test -- --run` | testi enot, enkraten zagon |
| `npm run typecheck` | preverba tipov za `src/` |
| `npm run typecheck:api` | preverba tipov za `api/` |

Dvoje, kar preseneti:

- **`npm test` brez `-- --run` se zažene v načinu opazovanja** in se ne konča.
- **`npm run build` tipov ne preverja.** Build uspe tudi ob tipskih napakah,
  zato zelen deploy ne pove ničesar o TypeScriptu.

> `npm run typecheck` javi **26 napak** v 11 datotekah (`PlayerDetail`, `Profile`,
> `LeagueMatchScoresheet`, `TournamentEdit` in 7 testnih; merjeno 7. 8. 2026).
> To ni regresija — takšno je stanje na `main`; pomembno je le, da tvoja
> sprememba tega števila ne poveča.
> Del napak izvira iz tega, da `tsconfig.json` nima `types: ["node"]`, testi pa
> uvažajo `node:fs`. `npm run typecheck:api` je čist.

## Struktura

```
src/
  pages/          zasloni, ki ustrezajo potem (Clubs, League, Tournament …)
    admin/        13 admin zaslonov pod /admin/* (ClubAdmin, LeagueAdmin, zapisnik …)
  components/     deljene komponente; večina predstavitvenih, nekatere
                  (LaneInput, GroupBracket, MatchJudgeSelect, ImageUpload)
                  same pišejo v Supabase
  engines/        ČISTA LOGIKA brez I/O — razporedi, lestvice, statistika
  lib/            mešano: odjemalci baze (rangLestvica, series, knockoutDraw),
                  React hooki (useRealtimeTable) in čiste pomožne funkcije
                  (playerImport/, dpPlacement, matchDate)
  contexts/       AuthContext (prijava, profil, vloga)
  types.ts        skupni tipi (LeagueFixture, Tournament, UserProfile …)
  supabase.ts     odjemalec Supabase
api/              serverless funkcije na Vercelu (uvoz igralcev)
supabase/
  migrations/     SQL migracije — glej opozorilo o vrstnem redu spodaj
docs/superpowers/ speci in načrti večjih posegov
scripts/          lokalna orodja (v .gitignore, glej CONTRIBUTING.md)
```

**`engines/` je čista logika brez I/O** in ima najgostejšo testno pokritost:
13 datotek, 201 testov. Testi so tudi v `lib/` — 9 datotek, 61 testov,
predvsem `lib/playerImport/`. Če pišeš pravilo tekmovanja (razvrstitev, žreb,
točkovanje), sodi v `engines/` in dobi test. Nekaj pravil iz zgodovinskih
razlogov še živi v `lib/` (npr. `dpPlacement.ts`).

## Baza

Shemo in pravice upravljajo SQL migracije v `supabase/migrations/`. **Migracije
se poganjajo ročno** v Supabase SQL editorju — ni CLI-ja in ni CI, ki bi jih
uveljavil. Pravila so v [CONTRIBUTING.md](CONTRIBUTING.md).

Tri stvari o tej mapi, ki niso očitne:

- **Poimenovanje je `YYYYMMDD_NN_opis.sql`**, kjer `NN` uredi datoteke znotraj
  istega dne. Abecedni vrstni red je zato hkrati veljaven vrstni red izvajanja
  — nova migracija dobi naslednjo prosto številko tistega dne.
- **`00_schema.sql`, `01_out_of_band_schema.sql` in
  `02_out_of_band_schema_dopolnitev.sql` so izhodišče**, ne navadne migracije:
  prva je osnovna shema, drugi dve dokumentirata objekte, ki so nastali mimo
  repozitorija.
- **Zaporedje znotraj dneva ni okras.** Primer: `20260729_02_users_pii_authenticated`
  ustvari pogled `users_sensitive`, `20260729_04_users_birth_year_2_restrict` pa
  ga pobriše in ustvari znova z `birth_year`. Ob zamenjanem vrstnem redu bi se
  baza zgradila brez napake, pogled pa bi ostal brez stolpca.

Povratke (`*_ROLLBACK.sql`) najdeš v `supabase/rollback/`. Namenoma niso v
`migrations/`, da jih noben izvajalec ne požene kot del zaporedja.

Ključni pojmi:

- **RLS je vklopljen povsod.** Javne strani berejo prek permisivne politike
  `for select using (true)`, pisanje je omejeno na admine in sodnike.
- **Osebni podatki** (EMŠO, e-pošta, telefon, naslov, poln datum rojstva,
  številka licence) niso berljivi iz `public.users`. Dostopni so prek pogleda
  `public.users_sensitive`, ki vrstice omeji na lasten profil ali admina.
- **Vloge** (`player`, `judge`, `admin`, `super_admin`) se spreminjajo izključno
  prek funkcije `public.set_user_role()`.

## Objava

Potisk na `main` sproži produkcijski deploy na Vercelu, vsak PR dobi svoj
preview URL. Migracije se **ne** uveljavijo same — to je ločen ročni korak.

## Dokumentacija

- [CLAUDE.md](CLAUDE.md) — pravila za agente in ljudi na kratko; zlasti: vsaka sprememba sheme gre skozi migracijo
- [CONTRIBUTING.md](CONTRIBUTING.md) — pravila, ki jih iz kode ni videti; preberi pred prvim PR
- [SETUP.md](SETUP.md) — postavitev **novega** Supabase projekta iz nič (preverjeno 7. 8. 2026 na praznem projektu)
- `docs/superpowers/specs/` in `plans/` — dizajni in načrti večjih posegov

Orodij za slog ni: ESLint, Prettier in CI v projektu ne obstajajo. Kakovost
držita typecheck in testi, ki ju poženeš sam.
