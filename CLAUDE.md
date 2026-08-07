# Navodila za delo v tem repozitoriju

Ta datoteka zbira pravila, ki se jih iz kode ne da razbrati in ki so nas že
kdaj stala časa. Podrobnejši opis projekta je v [README.md](README.md), pravila
za prispevke v [CONTRIBUTING.md](CONTRIBUTING.md).

**Jezik:** koda, komentarji, sporočila commitov, opisi PR-jev in vmesnik so v
slovenščini.

---

## Baza: vsaka sprememba sheme gre skozi migracijo

**Sheme nikoli ne spreminjaj neposredno v Supabase SQL Editorju.** Vsaka
sprememba — nov stolpec, indeks, omejitev, politika, funkcija, prožilec — mora
najprej obstajati kot datoteka v `supabase/migrations/`, šele nato se požene na
produkciji.

To ni birokracija. 7. 8. 2026 smo prvič zares poskusili bazo zgraditi iz
repozitorija na prazen projekt. Vse migracije so se izvedle brez napake, a
**nastala shema ni bila enaka produkcijski — razhajala se je v devetih
rečeh**, ker so bile te nastale mimo repozitorija:

- `tournament_groups.group_size` sploh ni obstajal → žreb skupin je padel z
  `ERROR 42703: column "group_size" does not exist`
- CHECK za `league_seasons.category` je dovolil le `men/women/u18` → sezone
  U14 in U18 ženske se ne bi dale ustvariti
- manjkali so še CHECK za `tier` in `group_size`, NOT NULL na
  `double_registrations.season_id`, CHECK `dr_different_teams`, privzetek in
  NOT NULL na `league_fixtures.judge_ids` ter `set search_path` na
  `sync_user_club`

Nobenega od teh ne bi opazil ob obnovi — opazil bi ga šele ob prvem turnirju.
Razhajanje zapira `20260807_01_db_reset_zdrs.sql`, zgodovina teh popravkov pa
je v `01_out_of_band_schema.sql` in `02_out_of_band_schema_dopolnitev.sql`.

Če se kdaj mudi in gre sprememba naravnost v produkcijo, **še isti dan** dodaj
ustrezno migracijo. Idempotentno (`if not exists`, `drop … if exists` pred
`add`), da je na produkciji no-op.

### Poimenovanje in vrstni red

`YYYYMMDD_NN_opis.sql`. Abecedni vrstni red **je** vrstni red izvajanja —
nova migracija dobi naslednjo prosto številko tistega dne. Zaporedje znotraj
dneva ni okras: `20260729_02` ustvari pogled, `20260729_04` ga pobriše in
ustvari znova s stolpcem več.

`00_schema.sql`, `01_out_of_band_schema.sql` in
`02_out_of_band_schema_dopolnitev.sql` so izhodišče, ne navadne migracije.

Povratki gredo v `supabase/rollback/` s pripono `_ROLLBACK.sql` — namenoma
zunaj `migrations/`, da ne pridejo v zaporedje.

### Kako preveriti, da razhajanja ni

Primerjava dveh baz prek md5 vsote celotnih definicij (poženi na obeh in
primerjaj vrstici):

```sql
with cols as (
  select md5(string_agg(c.table_name||'.'||c.column_name||':'||c.data_type||':'||
             coalesce(c.column_default,'-')||':'||c.is_nullable,
             '|' order by c.table_name, c.column_name)) h
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema=c.table_schema and t.table_name=c.table_name
  where c.table_schema='public' and t.table_type='BASE TABLE'
), idx as (select md5(string_agg(indexname||':'||indexdef,'|' order by indexname)) h
           from pg_indexes where schemaname='public'
), fn as (select md5(string_agg(p.proname||':'||replace(pg_get_functiondef(p.oid),chr(13),''),
                     '|' order by p.proname)) h
          from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
), con as (select md5(string_agg(pc.conrelid::regclass::text||':'||pc.conname||':'||
                      pg_get_constraintdef(pc.oid),'|' order by 1)) h
           from pg_constraint pc join pg_namespace n on n.oid=pc.connamespace
           where n.nspname='public')
select (select h from cols) cols, (select h from idx) idx,
       (select h from fn) fn, (select h from con) con;
```

`replace(…, chr(13), '')` je nujen: telesa funkcij, ki so bila kdaj prilepljena
skozi brskalnik, imajo CRLF, iz repozitorija pa pridejo z LF. Brez tega vse
funkcije izpadejo različne, čeprav so enake.

Kar migracije **ne** pokrijejo: Storage (vedra in politike nad
`storage.objects`) in nastavitve avtentikacije iz Dashboarda. Ročni koraki so
opisani v [SETUP.md](SETUP.md).

---

## Razvojne baze ni

`.env.local` kaže na **produkcijski** projekt. Lokalni razvoj piše v živo bazo
balinar.app. Pri delu z obrazci, uvozi in admin zasloni uporabljaj sintetične
zapise s predpono `ZZ Test` in jih za sabo pobriši.

Preden narediš karkoli, kar piše v bazo, se dogovori z lastnikom projekta.

---

## Kje kaj sodi

- `src/engines/` — **čista logika brez I/O**: razporedi, žrebi, lestvice,
  točkovanje. Ima najgostejšo testno pokritost. Vsako novo pravilo tekmovanja
  sodi sem in **dobi test**.
- `src/lib/` — mešano: odjemalci baze, React hooki, pomožne funkcije. Nekaj
  pravil iz zgodovinskih razlogov še živi tu (npr. `dpPlacement.ts`); novih ne
  dodajaj.
- `src/pages/admin/` — admin zasloni pod `/admin/*`.

Poizvedbe gredo neposredno prek `supabase.from()` v `useEffect`. TanStack Query
je nameščen, a se za poizvedbe ne uporablja — ne uvajaj ga mimogrede.

---

## Preverjanje pred PR

```bash
npm test -- --run      # brez --run se zažene v načinu opazovanja in se ne konča
npm run typecheck      # POZOR: na main že javi 26 napak v 11 datotekah (7. 8. 2026)
```

`npm run build` **tipov ne preverja** — zelen deploy ne pove ničesar o
TypeScriptu.

Pri `typecheck` ne gre za to, da bi bilo nič napak, ampak da tvoja sprememba
njihovega števila ne poveča.

ESLint, Prettier in CI v projektu ne obstajajo. Kakovost držita typecheck in
testi, ki ju poženeš sam.

---

## Objava

Potisk na `main` sproži produkcijski deploy na Vercelu, vsak PR dobi preview
URL. **Migracije se ne uveljavijo same** — to je ločen ročni korak, ki ga
opravi človek ali agent z dostopom do Supabase.
