# Večdržavni temelj (A1) — načrt izvedbe

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** balinar.app dobi dimenzijo države — `country_id` v shemi, poti `/si` in `/hr`, domensko preslikavo in admin pravice, vezane na državo — pri čemer se obstoječi slovenski podatki in vse obstoječe povezave obnašajo nespremenjeno.

**Architecture:** Ena baza, `country_id` na šestih korenskih tabelah; otroci državo dedujejo prek tujega ključa. Branje javnih podatkov filtrira aplikacija prek `fromCountry()` ovojnice; branje osebnih podatkov in pisanje varuje RLS, vezan na `users.admin_country_id`. Državo razreši `CountryProvider` iz domene ali prvega segmenta poti.

**Tech Stack:** React 18 + react-router-dom v6, TanStack Query, Supabase (PostgREST + RLS), TypeScript, Vite, Vitest.

**Spec:** [`docs/superpowers/specs/2026-07-19-vecdrzavni-temelj-a1-design.md`](../specs/2026-07-19-vecdrzavni-temelj-a1-design.md)

**Veja:** `vecdrzavni-temelj-a1` (že obstaja, vsebuje spec)

---

## Preden začneš

**Ključi in dostop.** Bralne poizvedbe proti produkciji tečejo prek
`C:\Users\HP\BocceAPP\scripts\.env.local` (`SUPABASE_URL`, `SERVICE_ROLE_KEY`).
`dotenv` **ni** nameščen — `.env.local` beri ročno (vzorec v nalogi 1).

**Ta repo je javen.** Nikoli ne commitaj resničnih EMŠO, imen, naslovov ali
e-mailov — ne v teste, ne v fixture, ne v sporočila commitov. Uporabljaj
sintetične podatke.

**Vrstni red je pomemben.** Migracija (naloge 1–6) gre v produkcijo **pred**
kodo (naloge 7+). Nullable stolpec, ki ga nihče ne bere, je neškodljiv; koda, ki
bere stolpec, ki ga še ni, ni.

**Zakaj tu ni klasičnega TDD povsod.** Repo ima teste enot samo za čisto logiko
v `src/engines/`. SQL migracije se preverjajo s poizvedbami, ne s testi enot; UI
nima testnega ogrodja za komponente. Testi so zato napisani tam, kjer gre za
čisto logiko (razreševanje države, gradnja poti, stražni test), drugod pa so
navedene točne poizvedbe in pričakovani izidi.

---

## Struktura datotek

**Nove:**

| Datoteka | Odgovornost |
|---|---|
| `supabase/migrations/2026-07-19_countries.sql` | tabela `countries` + vsebina |
| `supabase/migrations/2026-07-19_country_id_nullable.sql` | `country_id` nullable + indeksi |
| `supabase/migrations/2026-07-19_country_id_backfill.sql` | zapolnitev na SI |
| `supabase/migrations/2026-07-19_country_id_notnull.sql` | `not null`, unique omejitve, `matches.tournament_id` |
| `supabase/migrations/2026-07-19_admin_country_scope.sql` | `admin_country_id` + RLS politike |
| `src/lib/countries.ts` | čista logika: preslikava domena→koda, gradnja poti |
| `src/lib/countries.test.ts` | testi zanjo |
| `src/contexts/CountryContext.tsx` | `CountryProvider`, `useCountry()` |
| `src/lib/fromCountry.ts` | ovojnica, ki doda filter države |
| `src/lib/fromCountry.test.ts` | testi zanjo |
| `src/lib/useAdminCountry.ts` | katero državo ureja trenutni admin |
| `src/components/CountrySwitcher.tsx` | izbirnik države v glavi |
| `src/components/AdminCountrySwitcher.tsx` | izbirnik države za `super_admin` |
| `src/guards/rootTableQueries.test.ts` | stražni test proti nefiltriranim `.from()` |
| `scripts/check-country-isolation.cjs` | preverba RLS meje neposredno proti bazi |

**Spremenjene:** `src/App.tsx` (usmerjanje), `src/contexts/AuthContext.tsx`
(`admin_country_id` v profilu), `src/types.ts`, `src/components/Navbar.tsx`,
`api/import-players.ts` (izrecen argument države), ter ~25 datotek s
poizvedbami (naloge 12–16).

---

# FAZA I — MIGRACIJA BAZE

## Naloga 1: Orodje za bralne poizvedbe proti produkciji

Vse naslednje naloge potrebujejo način, kako preveriti stanje baze. Naredimo ga
enkrat.

**Files:**
- Create: `scripts/db-query.cjs`

- [ ] **Korak 1: Napiši pomožno skripto**

```javascript
// scripts/db-query.cjs — bralno orodje za preverbe migracij.
// Uporaba: node scripts/db-query.cjs "<ime-preverbe>"
// Ne izpisuje osebnih podatkov — samo števce in maskirane oblike.
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnv() {
  const p = path.join(__dirname, '.env.local');
  const env = {};
  fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  });
  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error('Manjka SUPABASE_URL ali SERVICE_ROLE_KEY v scripts/.env.local');
  }
  return env;
}

const env = loadEnv();
const sb = createClient(env.SUPABASE_URL, env.SERVICE_ROLE_KEY);

async function count(table, filter) {
  let q = sb.from(table).select('*', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count: n, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return n;
}

module.exports = { sb, count };

if (require.main === module) {
  (async () => {
    const ROOTS = ['clubs', 'users', 'league_seasons', 'tournaments',
                   'tournament_series', 'calendar_events'];
    console.log('=== stevci korenskih tabel ===');
    for (const t of ROOTS) console.log(`${t.padEnd(20)} ${await count(t)}`);
  })().catch(e => { console.error('NAPAKA:', e.message); process.exit(1); });
}
```

- [ ] **Korak 2: Poženi in shrani izhodiščne števce**

Run: `node scripts/db-query.cjs`

Pričakovano: šest vrstic s števci. **Zapiši si jih** — v nalogi 22 morajo biti
identični.

- [ ] **Korak 3: Commit**

```bash
git add scripts/db-query.cjs
git commit -m "chore: bralno orodje za preverbe migracij A1"
```

---

## Naloga 2: Varnostna kopija prizadetih tabel

Ista praksa kot `_bak_zapisnik_*_20260704` pri prepisu liga zapisnika.

**Files:**
- Create: `supabase/migrations/2026-07-19_00_backup.sql` (ročno pognan, ne del deploya)

- [ ] **Korak 1: Napiši kopije**

```sql
-- Varnostne kopije pred A1. Pognati ROČNO v Supabase SQL editorju.
-- Odstraniti po uspešni potrditvi A1 v produkciji.
create table _bak_a1_clubs_20260719            as select * from public.clubs;
create table _bak_a1_users_20260719            as select * from public.users;
create table _bak_a1_league_seasons_20260719   as select * from public.league_seasons;
create table _bak_a1_tournaments_20260719      as select * from public.tournaments;
create table _bak_a1_tournament_series_20260719 as select * from public.tournament_series;
create table _bak_a1_calendar_events_20260719  as select * from public.calendar_events;
create table _bak_a1_matches_20260719          as select * from public.matches;
```

- [ ] **Korak 2: Poženi v Supabase SQL editorju in preveri**

```sql
select 'clubs' t, count(*) from _bak_a1_clubs_20260719
union all select 'users', count(*) from _bak_a1_users_20260719
union all select 'league_seasons', count(*) from _bak_a1_league_seasons_20260719
union all select 'tournaments', count(*) from _bak_a1_tournaments_20260719
union all select 'tournament_series', count(*) from _bak_a1_tournament_series_20260719
union all select 'calendar_events', count(*) from _bak_a1_calendar_events_20260719
union all select 'matches', count(*) from _bak_a1_matches_20260719;
```

Pričakovano: števci se ujemajo z nalogo 1 (in `matches` = 541).

- [ ] **Korak 3: Commit**

```bash
git add supabase/migrations/2026-07-19_00_backup.sql
git commit -m "chore: varnostne kopije tabel pred A1"
```

---

## Naloga 3: Tabela `countries`

**Files:**
- Create: `supabase/migrations/2026-07-19_countries.sql`

- [ ] **Korak 1: Napiši migracijo**

```sql
-- A1: dimenzija države. Ta korak ne spremeni nobene obstoječe tabele.
create table if not exists public.countries (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name_sl    text not null,
  name_local text not null,
  is_active  boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

insert into public.countries (code, name_sl, name_local, is_active, sort_order) values
  ('si', 'Slovenija',           'Slovenija',            true,  1),
  ('hr', 'Hrvaška',             'Hrvatska',             false, 2),
  ('rs', 'Srbija',              'Србија',               false, 3),
  ('me', 'Črna gora',           'Црна Гора',            false, 4),
  ('ba', 'Bosna in Hercegovina','Bosna i Hercegovina',  false, 5)
on conflict (code) do nothing;

alter table public.countries enable row level security;

-- Seznam držav je javen — potrebuje ga izbirnik za neprijavljene obiskovalce.
drop policy if exists "Javni ogled drzav" on public.countries;
create policy "Javni ogled drzav" on public.countries for select using (true);

drop policy if exists "Super admin ureja drzave" on public.countries;
create policy "Super admin ureja drzave" on public.countries for all using (
  exists (select 1 from public.users
          where users.id = auth.uid() and users.role = 'super_admin')
);
```

- [ ] **Korak 2: Poženi in preveri**

```sql
select code, name_sl, is_active, sort_order from public.countries order by sort_order;
```

Pričakovano: 5 vrstic, samo `si` ima `is_active = true`.

- [ ] **Korak 3: Commit**

```bash
git add supabase/migrations/2026-07-19_countries.sql
git commit -m "feat(db): tabela countries s petimi drzavami, aktivna le SI"
```

---

## Naloga 4: `country_id` kot nullable + indeksi

**Files:**
- Create: `supabase/migrations/2026-07-19_country_id_nullable.sql`

- [ ] **Korak 1: Napiši migracijo**

```sql
-- A1: country_id na šestih korenskih tabelah. Nullable — zapolnitev je ločen korak.
-- Otroci (league_teams, league_fixtures, tournament_groups, matches, ...) stolpca
-- NE dobijo: državo dedujejo prek tujega ključa na starša.
alter table public.clubs             add column if not exists country_id uuid references public.countries(id);
alter table public.users             add column if not exists country_id uuid references public.countries(id);
alter table public.league_seasons    add column if not exists country_id uuid references public.countries(id);
alter table public.tournaments       add column if not exists country_id uuid references public.countries(id);
alter table public.tournament_series add column if not exists country_id uuid references public.countries(id);
alter table public.calendar_events   add column if not exists country_id uuid references public.countries(id);

create index if not exists clubs_country_id_idx             on public.clubs (country_id);
create index if not exists users_country_id_idx             on public.users (country_id);
create index if not exists league_seasons_country_id_idx    on public.league_seasons (country_id);
create index if not exists tournaments_country_id_idx       on public.tournaments (country_id);
create index if not exists tournament_series_country_id_idx on public.tournament_series (country_id);
create index if not exists calendar_events_country_id_idx   on public.calendar_events (country_id);
```

- [ ] **Korak 2: Poženi in preveri, da stolpec obstaja povsod**

```sql
select table_name, is_nullable
from information_schema.columns
where column_name = 'country_id' and table_schema = 'public'
order by table_name;
```

Pričakovano: 6 vrstic, vse `is_nullable = YES`.

- [ ] **Korak 3: Preveri, da aplikacija še dela**

Odpri produkcijsko balinar.app, klikni skozi klube, ligo in turnirje.
Pričakovano: nespremenjeno. Nihče še ne bere tega stolpca.

- [ ] **Korak 4: Commit**

```bash
git add supabase/migrations/2026-07-19_country_id_nullable.sql
git commit -m "feat(db): country_id (nullable) + indeksi na sestih korenskih tabelah"
```

---

## Naloga 5: Zapolnitev na Slovenijo

**Files:**
- Create: `supabase/migrations/2026-07-19_country_id_backfill.sql`

- [ ] **Korak 1: Napiši migracijo**

```sql
-- A1: vsi obstoječi podatki so slovenski. To ni ugibanje — do te točke
-- aplikacija ni imela pojma države.
do $$
declare si_id uuid;
begin
  select id into strict si_id from public.countries where code = 'si';

  update public.clubs             set country_id = si_id where country_id is null;
  update public.users             set country_id = si_id where country_id is null;
  update public.league_seasons    set country_id = si_id where country_id is null;
  update public.tournaments       set country_id = si_id where country_id is null;
  update public.tournament_series set country_id = si_id where country_id is null;
  update public.calendar_events   set country_id = si_id where country_id is null;
end $$;
```

- [ ] **Korak 2: Poženi in preveri, da ni več praznih**

```sql
select 'clubs' t, count(*) n from public.clubs where country_id is null
union all select 'users', count(*) from public.users where country_id is null
union all select 'league_seasons', count(*) from public.league_seasons where country_id is null
union all select 'tournaments', count(*) from public.tournaments where country_id is null
union all select 'tournament_series', count(*) from public.tournament_series where country_id is null
union all select 'calendar_events', count(*) from public.calendar_events where country_id is null;
```

Pričakovano: vseh šest vrstic ima `n = 0`.

- [ ] **Korak 3: Preveri, da števci niso padli**

Run: `node scripts/db-query.cjs`

Pričakovano: identično nalogi 1. `update` ne sme spremeniti števila vrstic —
če se je karkoli premaknilo, ustavi in razišči.

- [ ] **Korak 4: Commit**

```bash
git add supabase/migrations/2026-07-19_country_id_backfill.sql
git commit -m "feat(db): zapolni country_id na SI za vse obstojece podatke"
```

---

## Naloga 6: `not null`, unique omejitve, `matches.tournament_id`

**Files:**
- Create: `supabase/migrations/2026-07-19_country_id_notnull.sql`

- [ ] **Korak 1: Popiši unique omejitve na vseh šestih koreninah**

Spec zahteva pregled vseh omejitev iz
`2026-07-09_import_unique_constraints.sql`, ne le tistih na `users`.

```sql
-- a) unique omejitve
select c.conrelid::regclass::text as tabela, c.conname,
       pg_get_constraintdef(c.oid) as definicija
from pg_constraint c
where c.contype = 'u'
  and c.conrelid::regclass::text in
      ('clubs','users','league_seasons','tournaments',
       'tournament_series','calendar_events')
order by tabela, c.conname;

-- b) unique indeksi (ti se ne pojavijo zgoraj)
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexdef ilike '%unique%'
  and tablename in ('clubs','users','league_seasons','tournaments',
                    'tournament_series','calendar_events')
order by tablename, indexname;
```

Zapiši oba izpisa v opis PR. Pravilo presoje:

- Omejitev na **nacionalnem registrskem podatku** (emso, registrska številka) →
  mora dobiti `country_id`. Migracija spodaj to naredi za `emso`.
- Omejitev na **imenu** (npr. `clubs.name`) → verjetno prav tako, saj lahko
  slovenski in hrvaški klub nosita isto ime. **Če jo najdeš, ustavi in vprašaj** —
  spec je ni predvidel in ni odločeno, ali je enakost imen čez državo dopustna.
- Omejitev na **surogatnem ključu** (id) → ostane.

Spec predvideva le `users_emso_unique`. Karkoli drugega je razhod med repom in
bazo — dokumentiraj ga, kot zahteva korak 0.

- [ ] **Korak 2: Napiši migracijo**

```sql
-- A1, zaključni korak. Predpostavlja, da je zapolnitev opravljena.

-- 1. not null + prehodni privzetek na SI.
--    PRIVZETEK JE ZAČASEN — pade v nalogi 21, ko so skripte prevezane.
--    Privzetek, ki ostane, je tihi tovornjak podatkov v napačno državo.
do $$
declare si_id uuid;
begin
  select id into strict si_id from public.countries where code = 'si';
  execute format('alter table public.clubs             alter column country_id set default %L', si_id);
  execute format('alter table public.users             alter column country_id set default %L', si_id);
  execute format('alter table public.league_seasons    alter column country_id set default %L', si_id);
  execute format('alter table public.tournaments       alter column country_id set default %L', si_id);
  execute format('alter table public.tournament_series alter column country_id set default %L', si_id);
  execute format('alter table public.calendar_events   alter column country_id set default %L', si_id);
end $$;

alter table public.clubs             alter column country_id set not null;
alter table public.users             alter column country_id set not null;
alter table public.league_seasons    alter column country_id set not null;
alter table public.tournaments       alter column country_id set not null;
alter table public.tournament_series alter column country_id set not null;
alter table public.calendar_events   alter column country_id set not null;

-- 2. EMŠO je slovenski konstrukt — enoličnost velja znotraj države.
alter table public.users drop constraint if exists users_emso_unique;
create unique index if not exists users_country_emso_unique
  on public.users (country_id, emso) where emso is not null;

-- 3. Nacionalna registrska številka. HR uporablja obliko 'F922/98'.
--    users.license_number se NE uporabi: 164/1176 zapolnjenih, sedem različnih
--    oblik, ena vrednost s presledkom sredi, ena prazen niz, 5 podvojenih —
--    unique bi ob uveljavitvi padel. Preverjeno 2026-07-19.
alter table public.users add column if not exists registration_number text;
create unique index if not exists users_country_regnum_unique
  on public.users (country_id, registration_number)
  where registration_number is not null and length(trim(registration_number)) > 0;

-- 4. matches: dedovanje države prek starša. tournament_id je v praksi vedno
--    zapolnjen (0/541 null, preverjeno 2026-07-19) — shemi je manjkala izjava.
alter table public.matches alter column tournament_id set not null;
```

- [ ] **Korak 3: Poženi in preveri**

```sql
-- a) not null povsod
select table_name, is_nullable from information_schema.columns
where column_name = 'country_id' and table_schema = 'public' order by table_name;
-- pričakovano: 6 vrstic, vse NO

-- b) matches
select is_nullable from information_schema.columns
where table_schema='public' and table_name='matches' and column_name='tournament_id';
-- pričakovano: NO

-- c) nova indeksa obstajata
select indexname from pg_indexes
where schemaname='public' and indexname in
  ('users_country_emso_unique','users_country_regnum_unique');
-- pričakovano: 2 vrstici
```

- [ ] **Korak 4: Preveri, da aplikacija še dela**

Odpri produkcijsko balinar.app: klubi, igralec, liga z lestvico, zapisnik tekme.
Pričakovano: nespremenjeno.

- [ ] **Korak 5: Commit**

```bash
git add supabase/migrations/2026-07-19_country_id_notnull.sql
git commit -m "feat(db): country_id not null, unique po drzavi, matches.tournament_id not null"
```

---

## Naloga 7: Admin pravice, vezane na državo

Danes vidi **vsak** admin osebne podatke **vseh** uporabnikov.
`20260628_restrict_users_pii_from_anon.sql` ščiti le pred `anon`. Ko dobi oseba
iz HBS admin vlogo, bere EMŠO in naslove slovenskih igralcev — obdelava brez
pravne podlage.

**Files:**
- Create: `supabase/migrations/2026-07-19_admin_country_scope.sql`

- [ ] **Korak 1: Popiši obstoječe politike, preden jih zamenjaš**

```sql
select tablename, policyname, cmd, qual::text
from pg_policies
where schemaname = 'public'
  and tablename in ('clubs','users','league_seasons','tournaments',
                    'tournament_series','calendar_events')
order by tablename, policyname;
```

Shrani izpis v komentar commita. Migracija spodaj predpostavlja vzorec
`role = any(array['admin','super_admin'])`; če katera politika odstopa, jo
prilagodi posamično in **ne** ugibaj.

- [ ] **Korak 2: Napiši migracijo**

```sql
-- A1: admin vezan na državo.
alter table public.users
  add column if not exists admin_country_id uuid references public.countries(id);

comment on column public.users.admin_country_id is
  'Država, ki jo ta admin ureja. Smiselno le pri role=admin; pri player in super_admin je null.';

-- Pomožna funkcija: sme trenutni uporabnik urejati podatke te države?
create or replace function public.can_admin_country(target_country uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and (
        u.role = 'super_admin'
        or (u.role = 'admin' and u.admin_country_id = target_country)
      )
  );
$$;

revoke all on function public.can_admin_country(uuid) from public;
grant execute on function public.can_admin_country(uuid) to authenticated;

-- Politike pisanja na šestih koreninah.
do $$
declare t text;
begin
  foreach t in array array['clubs','league_seasons','tournaments',
                           'tournament_series','calendar_events']
  loop
    execute format('drop policy if exists "Admin urejanje" on public.%I', t);
    execute format($f$
      create policy "Admin urejanje po drzavi" on public.%I
        for all
        using (public.can_admin_country(country_id))
        with check (public.can_admin_country(country_id))
    $f$, t);
  end loop;
end $$;

-- users je poseben: uporabnik sme urejati lasten profil ne glede na državo.
drop policy if exists "Admin urejanje" on public.users;
create policy "Admin urejanje uporabnikov po drzavi" on public.users
  for all
  using (auth.uid() = id or public.can_admin_country(country_id))
  with check (auth.uid() = id or public.can_admin_country(country_id));
```

- [ ] **Korak 3: Poženi in preveri, da so politike zamenjane**

```sql
select tablename, policyname from pg_policies
where schemaname='public' and policyname like '%po drzavi%' order by tablename;
```

Pričakovano: 6 vrstic (5 iz zanke + `users`).

- [ ] **Korak 4: Commit**

```bash
git add supabase/migrations/2026-07-19_admin_country_scope.sql
git commit -m "feat(db): admin_country_id + RLS politike pisanja, vezane na drzavo"
```

---

## Naloga 8: Zaščita osebnih podatkov po državi

Ločeno od naloge 7, ker gre za **branje**, ne pisanje, in ker je to mesto, kjer
gre lahko kaj tiho narobe.

**Files:**
- Create: `supabase/migrations/2026-07-19_pii_country_scope.sql`

- [ ] **Korak 1: Napiši migracijo**

```sql
-- A1: admin sme brati občutljive stolpce users le za svojo državo.
-- Nadgradnja 20260628_restrict_users_pii_from_anon.sql, ki je ščitil le pred anon.
--
-- PostgREST stolpčnih pravic ne zna vezati na vrstico, zato gre zaščita prek
-- pogleda: javne strani berejo users (nekaj stolpcev), občutljive podatke pa
-- daje ta pogled, ki filtrira po državi.
create or replace view public.users_sensitive
with (security_invoker = true)
as
  select u.id, u.country_id, u.full_name, u.email, u.phone, u.emso,
         u.registration_number, u.date_of_birth, u.birth_city, u.birth_country,
         u.citizenship, u.address_street, u.address_house, u.address_postal,
         u.address_city, u.address_country
  from public.users u
  where u.id = auth.uid()
     or public.can_admin_country(u.country_id);

revoke all on public.users_sensitive from anon;
grant select on public.users_sensitive to authenticated;
```

- [ ] **Korak 2: Preveri, da pogled obstaja in anon nima dostopa**

```sql
select table_name from information_schema.views
where table_schema='public' and table_name='users_sensitive';
-- pričakovano: 1 vrstica

select grantee, privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name='users_sensitive';
-- pričakovano: authenticated/SELECT; anon se NE pojavi
```

- [ ] **Korak 3: Commit**

```bash
git add supabase/migrations/2026-07-19_pii_country_scope.sql
git commit -m "feat(db): pogled users_sensitive -- PII dostopen le za lastno drzavo"
```

---

## Naloga 9: Preverba izolacije neposredno proti bazi

Politika, ki jo obide surov PostgREST klic, ni politika. Zato se meja preverja
mimo UI.

**Files:**
- Create: `scripts/check-country-isolation.cjs`

- [ ] **Korak 1: Napiši preverbo**

```javascript
// scripts/check-country-isolation.cjs
// Preveri, da admin ene države ne doseže podatkov druge — NEPOSREDNO proti bazi,
// mimo UI. Ustvari začasna testna računa in ju na koncu pobriše.
//
// Uporablja SINTETIČNE podatke. Nikoli ne vpisuj resničnih oseb.
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const env = {};
fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8')
  .split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  });

const admin = createClient(env.SUPABASE_URL, env.SERVICE_ROLE_KEY);
const ANON = env.ANON_KEY;   // dodaj VITE_SUPABASE_ANON_KEY v scripts/.env.local kot ANON_KEY

const results = [];
function check(label, actual, expected) {
  const ok = actual === expected;
  results.push({ label, ok, actual, expected });
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}  (dobil: ${actual}, pricakoval: ${expected})`);
}

(async () => {
  const { data: countries } = await admin.from('countries').select('id, code');
  const SI = countries.find(c => c.code === 'si').id;
  const HR = countries.find(c => c.code === 'hr').id;

  // 1. Ustvari sintetičnega HR admina.
  const email = `test.hr.admin.${Date.now()}@example.invalid`;
  const password = 'Test-Izolacija-2026!';
  const { data: created, error: cErr } =
    await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (cErr) throw cErr;
  const uid = created.user.id;

  await admin.from('users').update({
    full_name: 'Testni Hrvaski Admin',
    role: 'admin',
    country_id: HR,
    admin_country_id: HR,
  }).eq('id', uid);

  // 2. Sintetični SI klub, ki ga HR admin NE sme videti/spremeniti.
  const { data: siClub } = await admin.from('clubs')
    .insert({ name: `ZZ Testni SI klub ${Date.now()}`, country_id: SI })
    .select().single();

  // 3. Prijavi se kot HR admin (navadna anon seja, brez service-role).
  const hr = createClient(env.SUPABASE_URL, ANON);
  const { error: sErr } = await hr.auth.signInWithPassword({ email, password });
  if (sErr) throw sErr;

  // 4. Preverbe.
  const upd = await hr.from('clubs').update({ city: 'VDOR' }).eq('id', siClub.id).select();
  check('HR admin NE sme spremeniti SI kluba', (upd.data || []).length, 0);

  const del = await hr.from('clubs').delete().eq('id', siClub.id).select();
  check('HR admin NE sme brisati SI kluba', (del.data || []).length, 0);

  const ins = await hr.from('clubs')
    .insert({ name: 'ZZ Vsiljeni SI klub', country_id: SI }).select();
  check('HR admin NE sme ustvariti SI kluba', ins.error ? 'zavrnjeno' : 'USPELO', 'zavrnjeno');

  const insHr = await hr.from('clubs')
    .insert({ name: `ZZ Testni HR klub ${Date.now()}`, country_id: HR }).select();
  check('HR admin SME ustvariti HR klub', insHr.error ? 'zavrnjeno' : 'uspelo', 'uspelo');

  const pii = await hr.from('users_sensitive').select('emso').eq('country_id', SI);
  check('HR admin NE vidi SI osebnih podatkov', (pii.data || []).length, 0);

  // 5. Pospravi.
  await hr.auth.signOut();
  if (insHr.data?.[0]) await admin.from('clubs').delete().eq('id', insHr.data[0].id);
  await admin.from('clubs').delete().eq('id', siClub.id);
  await admin.auth.admin.deleteUser(uid);

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} preverb uspesnih`);
  if (failed.length) { console.error('MEJA NE DRZI — ne nadaljuj z A1.'); process.exit(1); }
})().catch(e => { console.error('NAPAKA:', e.message); process.exit(1); });
```

- [ ] **Korak 2: Dodaj `ANON_KEY` v `scripts/.env.local`**

Vrednost je ista kot `VITE_SUPABASE_ANON_KEY` v korenskem `.env.local`.
`.env.local` je v `.gitignore` — preveri z `git check-ignore scripts/.env.local`.

- [ ] **Korak 3: Poženi**

Run: `node scripts/check-country-isolation.cjs`

Pričakovano: `5/5 preverb uspesnih`, izhodna koda 0.
Če katera pade, **ustavi** — politika iz naloge 7 ali 8 je napačna.

- [ ] **Korak 4: Commit**

```bash
git add scripts/check-country-isolation.cjs
git commit -m "test(db): preverba izolacije drzav neposredno proti bazi"
```

---

# FAZA II — RAZREŠEVANJE DRŽAVE V APLIKACIJI

## Naloga 10: Čista logika države (TDD)

Edini del A1, ki je prava čista logika. Tu velja klasični TDD.

**Files:**
- Create: `src/lib/countries.ts`
- Test: `src/lib/countries.test.ts`

- [ ] **Korak 1: Napiši padajoče teste**

```typescript
// src/lib/countries.test.ts
import { describe, it, expect } from 'vitest'
import {
  DOMAIN_COUNTRY_MAP, countryFromHostname, countryFromPath,
  resolveCountryCode, buildCountryPath, swapCountryInPath, DEFAULT_COUNTRY_CODE,
} from './countries'

describe('countryFromHostname', () => {
  it('preslika znano domeno', () => {
    expect(countryFromHostname('bocanje.top')).toBe('hr')
    expect(countryFromHostname('www.bocanje.top')).toBe('hr')
  })
  it('vrne null za privzeto domeno', () => {
    expect(countryFromHostname('balinar.app')).toBeNull()
    expect(countryFromHostname('localhost')).toBeNull()
  })
  it('ne loci po velikosti crk', () => {
    expect(countryFromHostname('BOCANJE.TOP')).toBe('hr')
  })
})

describe('countryFromPath', () => {
  it('prebere prvi segment', () => {
    expect(countryFromPath('/si/klubi')).toBe('si')
    expect(countryFromPath('/hr')).toBe('hr')
  })
  it('vrne null, ce prvi segment ni koda drzave', () => {
    expect(countryFromPath('/klubi')).toBeNull()
    expect(countryFromPath('/')).toBeNull()
    expect(countryFromPath('/admin/klubi')).toBeNull()
  })
})

describe('resolveCountryCode', () => {
  it('domena ima prednost pred potjo', () => {
    expect(resolveCountryCode('bocanje.top', '/si/klubi')).toBe('hr')
  })
  it('brez domenske preslikave uporabi pot', () => {
    expect(resolveCountryCode('balinar.app', '/hr/klubi')).toBe('hr')
  })
  it('brez obojega vrne privzeto', () => {
    expect(resolveCountryCode('balinar.app', '/klubi')).toBe(DEFAULT_COUNTRY_CODE)
  })
})

describe('buildCountryPath', () => {
  it('doda predpono na privzeti domeni', () => {
    expect(buildCountryPath('/klubi', 'si', false)).toBe('/si/klubi')
  })
  it('NE doda predpone, kadar drzavo doloca domena', () => {
    expect(buildCountryPath('/klubi', 'hr', true)).toBe('/klubi')
  })
  it('ohrani korensko pot', () => {
    expect(buildCountryPath('/', 'si', false)).toBe('/si')
    expect(buildCountryPath('/', 'hr', true)).toBe('/')
  })
})

describe('swapCountryInPath', () => {
  it('zamenja prvi segment in ohrani ostanek', () => {
    expect(swapCountryInPath('/si/klubi', 'hr')).toBe('/hr/klubi')
  })
  it('pelje na domaco stran, kadar pot vsebuje uuid', () => {
    const p = '/si/liga/3f1a5c2e-1111-2222-3333-444455556666'
    expect(swapCountryInPath(p, 'hr')).toBe('/hr/liga')
  })
  it('doda predpono, ce je ni bilo', () => {
    expect(swapCountryInPath('/klubi', 'hr')).toBe('/hr/klubi')
  })
})
```

- [ ] **Korak 2: Poženi teste in preveri, da padejo**

Run: `npm test -- src/lib/countries.test.ts`
Pričakovano: FAIL — `Failed to resolve import './countries'`

- [ ] **Korak 3: Napiši implementacijo**

```typescript
// src/lib/countries.ts
// Čista logika razreševanja države. Brez dostopa do baze in brez Reacta —
// zato je testabilna in tu velja TDD.

export const DEFAULT_COUNTRY_CODE = 'si'

/** Kode, ki jih pozna aplikacija. Ujemati se morajo s countries.code v bazi. */
export const KNOWN_COUNTRY_CODES = ['si', 'hr', 'rs', 'me', 'ba'] as const
export type CountryCode = (typeof KNOWN_COUNTRY_CODES)[number]

/**
 * Domena → koda države. Domena in baza nista ista odločitev: bocanje.top kaže
 * na isto namestitev, samo določi državo.
 */
export const DOMAIN_COUNTRY_MAP: Record<string, CountryCode> = {
  'bocanje.top': 'hr',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isCountryCode(v: string): v is CountryCode {
  return (KNOWN_COUNTRY_CODES as readonly string[]).includes(v)
}

export function countryFromHostname(hostname: string): CountryCode | null {
  const h = hostname.toLowerCase().replace(/^www\./, '')
  return DOMAIN_COUNTRY_MAP[h] ?? null
}

export function countryFromPath(pathname: string): CountryCode | null {
  const first = pathname.split('/').filter(Boolean)[0]
  return first && isCountryCode(first) ? first : null
}

export function resolveCountryCode(hostname: string, pathname: string): CountryCode {
  return countryFromHostname(hostname)
      ?? countryFromPath(pathname)
      ?? DEFAULT_COUNTRY_CODE
}

/**
 * Zgradi pot z upoštevanjem, ali državo že določa domena.
 * Na bocanje.top je pot /klubi, na balinar.app pa /hr/klubi.
 */
export function buildCountryPath(
  path: string, code: CountryCode, domainDecides: boolean,
): string {
  if (domainDecides) return path
  const clean = path.startsWith('/') ? path : `/${path}`
  return clean === '/' ? `/${code}` : `/${code}${clean}`
}

/**
 * Zamenjaj državo v poti. ID-ji so uuid-i in v drugi državi ne obstajajo, zato
 * se pot ob uuid-u odreže na domačo stran razdelka namesto slepe preslikave.
 */
export function swapCountryInPath(pathname: string, target: CountryCode): string {
  const segs = pathname.split('/').filter(Boolean)
  if (segs.length && isCountryCode(segs[0])) segs.shift()
  const cut = segs.findIndex(s => UUID_RE.test(s))
  const kept = cut === -1 ? segs : segs.slice(0, cut)
  return `/${[target, ...kept].join('/')}`
}
```

- [ ] **Korak 4: Poženi teste**

Run: `npm test -- src/lib/countries.test.ts`
Pričakovano: PASS, 14 testov.

- [ ] **Korak 5: Commit**

```bash
git add src/lib/countries.ts src/lib/countries.test.ts
git commit -m "feat: cista logika razresevanja drzave iz domene in poti"
```

---

## Naloga 11: `CountryProvider`

**Files:**
- Create: `src/contexts/CountryContext.tsx`
- Modify: `src/types.ts`

- [ ] **Korak 1: Dodaj tipe**

V `src/types.ts` dodaj na konec:

```typescript
export interface Country {
  id: string
  code: string
  name_sl: string
  name_local: string
  is_active: boolean
  sort_order: number
}

export interface CountryContextValue {
  country: Country | null
  countryId: string | null
  code: string
  /** true, kadar državo določa domena (bocanje.top) in ne predpona poti */
  domainDecides: boolean
  activeCountries: Country[]
  loading: boolean
  /** Zgradi pot znotraj trenutne države: path('/klubi') → '/si/klubi' */
  path: (p: string) => string
}
```

- [ ] **Korak 2: Napiši provider**

```tsx
// src/contexts/CountryContext.tsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import type { Country, CountryContextValue } from '../types'
import {
  countryFromHostname, resolveCountryCode, buildCountryPath, DEFAULT_COUNTRY_CODE,
} from '../lib/countries'
import type { CountryCode } from '../lib/countries'

const CountryContext = createContext<CountryContextValue | null>(null)

export function CountryProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const [countries, setCountries] = useState<Country[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('countries').select('*').order('sort_order')
      .then(({ data }) => { setCountries(data ?? []); setLoading(false) })
  }, [])

  const hostname = typeof window === 'undefined' ? '' : window.location.hostname
  const domainCode = countryFromHostname(hostname)
  const domainDecides = domainCode !== null
  const code = resolveCountryCode(hostname, location.pathname)

  const value = useMemo<CountryContextValue>(() => {
    const active = countries.filter(c => c.is_active)
    // Neveljavna ali neaktivna država pade na privzeto — brez tega bi
    // /xx/klubi pokazal prazno stran namesto slovenske vsebine.
    const found = countries.find(c => c.code === code && c.is_active)
      ?? countries.find(c => c.code === DEFAULT_COUNTRY_CODE)
      ?? null
    const effective = found?.code ?? DEFAULT_COUNTRY_CODE
    return {
      country: found,
      countryId: found?.id ?? null,
      code: effective,
      domainDecides,
      activeCountries: active,
      loading,
      path: (p: string) => buildCountryPath(p, effective as CountryCode, domainDecides),
    }
  }, [countries, code, domainDecides, loading])

  return <CountryContext.Provider value={value}>{children}</CountryContext.Provider>
}

export function useCountry(): CountryContextValue {
  const ctx = useContext(CountryContext)
  if (!ctx) throw new Error('useCountry mora biti znotraj CountryProvider')
  return ctx
}
```

- [ ] **Korak 3: Preveri tipe**

Run: `npm run typecheck`
Pričakovano: brez napak.

- [ ] **Korak 4: Commit**

```bash
git add src/contexts/CountryContext.tsx src/types.ts
git commit -m "feat: CountryProvider -- razresi drzavo iz domene ali poti"
```

---

## Naloga 12: Usmerjanje s predpono države

**Files:**
- Modify: `src/App.tsx`

- [ ] **Korak 1: Prestrukturiraj `App.tsx`**

Zamenjaj vsebino `<Routes>` in ovij z `CountryProvider`. Javne poti gredo pod
`/:countryCode/*`, avtentikacijske in admin ostanejo brez predpone, stare poti
dobijo preusmeritev.

```tsx
// src/App.tsx — zamenjaj telo komponente App in dodaj pomožni komponenti.
// Uvozi na vrhu datoteke (dodaj k obstoječim):
//   import { Navigate, useLocation, useParams } from 'react-router-dom'
//   import { CountryProvider } from './contexts/CountryContext'
//   import { KNOWN_COUNTRY_CODES, DEFAULT_COUNTRY_CODE, countryFromHostname } from './lib/countries'

/**
 * Stara povezava brez predpone (npr. /liga/tekma/<uuid>) → /si/... .
 * Brez tega bi vsaka do zdaj deljena povezava vrnila 404.
 */
function LegacyRedirect() {
  const location = useLocation()
  const stored = localStorage.getItem('balinar.country')
  const code = stored && (KNOWN_COUNTRY_CODES as readonly string[]).includes(stored)
    ? stored : DEFAULT_COUNTRY_CODE
  return <Navigate to={`/${code}${location.pathname}${location.search}`} replace />
}

/** Zavrni neznano kodo države, preden se pod njo izriše vsebina. */
function CountryGate({ children }: { children: React.ReactNode }) {
  const { countryCode } = useParams<{ countryCode: string }>()
  if (!countryCode || !(KNOWN_COUNTRY_CODES as readonly string[]).includes(countryCode)) {
    return <Navigate to={`/${DEFAULT_COUNTRY_CODE}`} replace />
  }
  return <>{children}</>
}

const PUBLIC_ROUTES = (
  <>
    <Route index element={<Home />} />
    <Route path="klubi" element={<ClubList />} />
    <Route path="klubi/:id" element={<ClubDetail />} />
    <Route path="igraci/:id" element={<PlayerDetail />} />
    <Route path="turnirji" element={<TournamentList kind="tournament" />} />
    <Route path="turnirji/:id" element={<TournamentDetail />} />
    <Route path="prvenstva" element={<TournamentList kind="championship" />} />
    <Route path="prvenstva/:id" element={<TournamentDetail />} />
    <Route path="liga" element={<LeagueList />} />
    <Route path="liga/:id" element={<LeagueDetail />} />
    <Route path="liga/tekma/:fixtureId" element={<LeagueMatchScoresheet />} />
    <Route path="statistika" element={<Statistics />} />
    <Route path="arhiv" element={<Archive />} />
    <Route path="rang" element={<LeagueRanking />} />
    <Route path="koledar" element={<Calendar />} />
    <Route path="serije" element={<Series />} />
    <Route path="serija/:id" element={<Series />} />
  </>
)

export default function App() {
  // Na bocanje.top državo določa domena — takrat predpone v poti NI.
  const domainDecides = countryFromHostname(
    typeof window === 'undefined' ? '' : window.location.hostname,
  ) !== null

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <CountryProvider>
          <AuthProvider>
            <Layout>
              <Routes>
                {/* Avtentikacija in admin — brez predpone države. */}
                <Route path="/prijava" element={<Login />} />
                <Route path="/registracija" element={<Signup />} />
                <Route path="/profil" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
                <Route path="/admin/turnirji" element={<AdminRoute><TournamentAdmin /></AdminRoute>} />
                <Route path="/admin/turnir/:id" element={<AdminRoute><TournamentEdit /></AdminRoute>} />
                <Route path="/admin/liga" element={<AdminRoute><LeagueAdmin /></AdminRoute>} />
                <Route path="/admin/uvoz-igralcev" element={<AdminRoute><PlayerImport /></AdminRoute>} />
                <Route path="/admin/liga/demo" element={<AdminRoute><LeagueMatchScoresheetDemo /></AdminRoute>} />
                <Route path="/admin/klubi" element={<AdminRoute><ClubAdmin /></AdminRoute>} />
                <Route path="/admin/uporabniki" element={<AdminRoute><UserAdmin /></AdminRoute>} />
                <Route path="/admin/dvojna-registracija" element={<AdminRoute><DoubleRegAdmin /></AdminRoute>} />
                <Route path="/admin/serije" element={<AdminRoute><SeriesAdmin /></AdminRoute>} />
                <Route path="/admin/serija/:id" element={<AdminRoute><SeriesEdit /></AdminRoute>} />
                <Route path="/admin/liga/tekma/:fixtureId" element={<OldScoresheetRedirect />} />

                {domainDecides ? (
                  /* bocanje.top/klubi — brez predpone */
                  <Route path="/">{PUBLIC_ROUTES}</Route>
                ) : (
                  <>
                    <Route path="/:countryCode">
                      <Route element={<CountryGate><Outlet /></CountryGate>}>
                        {PUBLIC_ROUTES}
                      </Route>
                    </Route>
                    {/* Stare povezave brez predpone. */}
                    <Route path="/" element={<LegacyRedirect />} />
                    <Route path="/klubi/*" element={<LegacyRedirect />} />
                    <Route path="/igraci/*" element={<LegacyRedirect />} />
                    <Route path="/turnirji/*" element={<LegacyRedirect />} />
                    <Route path="/prvenstva/*" element={<LegacyRedirect />} />
                    <Route path="/liga/*" element={<LegacyRedirect />} />
                    <Route path="/statistika" element={<LegacyRedirect />} />
                    <Route path="/arhiv" element={<LegacyRedirect />} />
                    <Route path="/rang" element={<LegacyRedirect />} />
                    <Route path="/koledar" element={<LegacyRedirect />} />
                    <Route path="/serije" element={<LegacyRedirect />} />
                    <Route path="/serija/*" element={<LegacyRedirect />} />
                  </>
                )}

                <Route path="*" element={<Navigate to={`/${DEFAULT_COUNTRY_CODE}`} replace />} />
              </Routes>
            </Layout>
          </AuthProvider>
        </CountryProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
```

Dodaj `Outlet` med uvoze iz `react-router-dom`. Odstrani prejšnji blok
`{/* Public */}` s potmi brez predpone in staro definicijo `App`.

- [ ] **Korak 2: Preveri tipe in zagon**

Run: `npm run typecheck && npm run dev`

Odpri `http://localhost:5173/` → pričakovano: preusmeri na `/si`.
Odpri `http://localhost:5173/klubi` → pričakovano: preusmeri na `/si/klubi`,
seznam klubov je viden.
Odpri `http://localhost:5173/xx/klubi` → pričakovano: preusmeri na `/si`.

- [ ] **Korak 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: predpona drzave v poteh + preusmeritve starih povezav"
```

---

## Naloga 13: Povezave v navigaciji

Ročno lepljenje predpone po komponentah je zanesljiv način, da se kakšna
pozabi. Navigacija gre skozi `path()`.

**Files:**
- Modify: `src/components/Navbar.tsx`

- [ ] **Korak 1: Prevedi vse povezave na `path()`**

V `Navbar.tsx` dodaj uvoz in zamenjaj vsak statični `to="/..."`, ki kaže na
javno stran:

```tsx
import { useCountry } from '../contexts/CountryContext'

// znotraj komponente:
const { path } = useCountry()

// nato vsaka javna povezava:
//   <Link to="/klubi">      →   <Link to={path('/klubi')}>
//   <Link to="/liga">       →   <Link to={path('/liga')}>
//   <Link to="/turnirji">   →   <Link to={path('/turnirji')}>
//   <Link to="/prvenstva">  →   <Link to={path('/prvenstva')}>
//   <Link to="/statistika"> →   <Link to={path('/statistika')}>
//   <Link to="/arhiv">      →   <Link to={path('/arhiv')}>
//   <Link to="/rang">       →   <Link to={path('/rang')}>
//   <Link to="/koledar">    →   <Link to={path('/koledar')}>
//   <Link to="/serije">     →   <Link to={path('/serije')}>
//   <Link to="/">           →   <Link to={path('/')}>
//
// NE spreminjaj: /prijava, /registracija, /profil, /admin/* — te so brez predpone.
```

- [ ] **Korak 2: Poišči preostale povezave brez predpone po vsem `src/`**

Run:
```bash
grep -rn "to=\"/\(klubi\|igraci\|turnirji\|prvenstva\|liga\|statistika\|arhiv\|rang\|koledar\|serij\)" src/
```

Pričakovano: prazen izpis. Vsak zadetek prevedi na `path('...')`.

Pozor na predloge z vrivanjem, npr. `` to={`/liga/${s.id}`} `` →
`` to={path(`/liga/${s.id}`)} ``. Poišči jih z:

```bash
grep -rn "to={\`/" src/
```

- [ ] **Korak 3: Preveri v brskalniku**

Run: `npm run dev`

Klikni skozi vse postavke v navigaciji na `/si`. Pričakovano: vsaka ohrani
predpono `/si` in nobena ne pade na preusmeritev.

- [ ] **Korak 4: Commit**

```bash
git add src/components/Navbar.tsx src/pages src/components
git commit -m "feat: navigacijske povezave gredo skozi path() -- ohranijo drzavo"
```

---

## Naloga 14: Izbirnik države

**Files:**
- Create: `src/components/CountrySwitcher.tsx`
- Modify: `src/components/Navbar.tsx`

- [ ] **Korak 1: Napiši komponento**

```tsx
// src/components/CountrySwitcher.tsx
import { useLocation, useNavigate } from 'react-router-dom'
import { useCountry } from '../contexts/CountryContext'
import { swapCountryInPath } from '../lib/countries'
import type { CountryCode } from '../lib/countries'

export default function CountrySwitcher() {
  const { code, activeCountries, domainDecides } = useCountry()
  const location = useLocation()
  const navigate = useNavigate()

  // Na bocanje.top državo določa domena — preklopnik tam nima pomena.
  if (domainDecides) return null
  // Dokler je aktivna le ena država, preklopnik samo zaseda prostor.
  if (activeCountries.length < 2) return null

  function onChange(next: string) {
    localStorage.setItem('balinar.country', next)
    navigate(swapCountryInPath(location.pathname, next as CountryCode))
  }

  return (
    <select
      value={code}
      onChange={e => onChange(e.target.value)}
      aria-label="Izbira države"
      className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
    >
      {activeCountries.map(c => (
        <option key={c.id} value={c.code}>{c.name_local}</option>
      ))}
    </select>
  )
}
```

- [ ] **Korak 2: Vstavi v `Navbar.tsx`**

```tsx
import CountrySwitcher from './CountrySwitcher'
// v desnem delu glave, ob gumbu za prijavo:
<CountrySwitcher />
```

- [ ] **Korak 3: Preveri**

Run: `npm run dev`

Pri eni aktivni državi: preklopnika ni videti (pravilno).
Za preizkus začasno v Supabase: `update countries set is_active = true where code='hr'`.
Osveži → preklopnik se pokaže, izbira Hrvaške pelje na `/hr/...`.
Nato **vrni**: `update countries set is_active = false where code='hr'`.

- [ ] **Korak 4: Commit**

```bash
git add src/components/CountrySwitcher.tsx src/components/Navbar.tsx
git commit -m "feat: izbirnik drzave (skrit, dokler je aktivna le ena)"
```

---

# FAZA III — FILTRIRANJE POIZVEDB

## Naloga 15: Ovojnica `fromCountry`

**Files:**
- Create: `src/lib/fromCountry.ts`
- Test: `src/lib/fromCountry.test.ts`

- [ ] **Korak 1: Napiši padajoč test**

```typescript
// src/lib/fromCountry.test.ts
import { describe, it, expect } from 'vitest'
import { ROOT_TABLES, isRootTable } from './fromCountry'

describe('ROOT_TABLES', () => {
  it('vsebuje natanko sest korenskih tabel', () => {
    expect([...ROOT_TABLES].sort()).toEqual([
      'calendar_events', 'clubs', 'league_seasons',
      'tournament_series', 'tournaments', 'users',
    ])
  })
  it('prepozna korensko tabelo', () => {
    expect(isRootTable('clubs')).toBe(true)
    expect(isRootTable('league_teams')).toBe(false)
  })
})
```

- [ ] **Korak 2: Poženi in preveri, da pade**

Run: `npm test -- src/lib/fromCountry.test.ts`
Pričakovano: FAIL — modul ne obstaja.

- [ ] **Korak 3: Napiši implementacijo**

```typescript
// src/lib/fromCountry.ts
import { supabase } from '../supabase'

/**
 * Šest korenskih tabel, ki nosijo country_id. Vse ostale tabele državo dedujejo
 * prek tujega ključa na starša in filtra NE potrebujejo.
 */
export const ROOT_TABLES = [
  'clubs', 'users', 'league_seasons',
  'tournaments', 'tournament_series', 'calendar_events',
] as const

export type RootTable = (typeof ROOT_TABLES)[number]

export function isRootTable(t: string): t is RootTable {
  return (ROOT_TABLES as readonly string[]).includes(t)
}

/**
 * Poizvedba na korensko tabelo, omejena na eno državo.
 *
 * Uporabljaj to namesto supabase.from() za teh šest tabel — tudi pri iskanju po
 * uuid-u. Uuid je sicer enoličen, a brez filtra bi /si/liga/<hr-uuid> prikazal
 * hrvaško ligo pod slovensko potjo; s filtrom postane 404, kar je pravilno.
 *
 * Ni abstrakcija čez Supabase — samo ta en zavoj.
 */
export function fromCountry(table: RootTable, countryId: string) {
  return {
    select: (cols = '*', opts?: { count?: 'exact'; head?: boolean }) =>
      supabase.from(table).select(cols, opts).eq('country_id', countryId),

    insert: (rows: Record<string, unknown> | Record<string, unknown>[]) =>
      supabase.from(table).insert(
        Array.isArray(rows)
          ? rows.map(r => ({ ...r, country_id: countryId }))
          : { ...rows, country_id: countryId },
      ),

    update: (patch: Record<string, unknown>) =>
      supabase.from(table).update(patch).eq('country_id', countryId),

    delete: () => supabase.from(table).delete().eq('country_id', countryId),
  }
}
```

- [ ] **Korak 4: Poženi test**

Run: `npm test -- src/lib/fromCountry.test.ts`
Pričakovano: PASS, 2 testa.

- [ ] **Korak 5: Commit**

```bash
git add src/lib/fromCountry.ts src/lib/fromCountry.test.ts
git commit -m "feat: fromCountry() -- poizvedbe na korenske tabele z drzavo"
```

---

## Naloga 16: Prevedi javne strani na `fromCountry`

Sedem datotek, ki jih vidi obiskovalec. Delaj po eni in po vsaki preveri v
brskalniku — filter, ki vrne prazen seznam namesto napake, je natanko okvara, ki
je tipi ne ujamejo.

**Files:**
- Modify: `src/pages/Clubs.tsx`, `src/pages/League.tsx`, `src/pages/Tournament.tsx`,
  `src/pages/Series.tsx`, `src/pages/Calendar.tsx`, `src/pages/Home.tsx`,
  `src/pages/StatsAndArchive.tsx`, `src/pages/PlayerDetail.tsx`

- [ ] **Korak 1: `Clubs.tsx`**

```tsx
import { useCountry } from '../contexts/CountryContext'
import { fromCountry } from '../lib/fromCountry'

// v ClubList:
const { countryId } = useCountry()
// prej: supabase.from('clubs').select('*').order('name')
// zdaj:
fromCountry('clubs', countryId!).select('*').order('name')

// v ClubDetail — oba klica:
fromCountry('clubs', countryId!).select('*').eq('id', id).single(),
fromCountry('users', countryId!).select(USER_PUBLIC_COLS).eq('club_id', id).order('full_name'),
```

Poizvedbe morajo počakati na `countryId`. Če uporabljajo TanStack Query, dodaj
`countryId` v `queryKey` in `enabled: !!countryId`; če uporabljajo `useEffect`,
dodaj `countryId` v odvisnosti in zgodnji `if (!countryId) return`.

- [ ] **Korak 2: Preveri `Clubs.tsx` v brskalniku**

Run: `npm run dev` → `/si/klubi`
Pričakovano: enak seznam klubov kot pred spremembo. Klik na klub pokaže člane.

- [ ] **Korak 3: Ponovi za preostale datoteke**

Isti vzorec:

| Datoteka | Poizvedbe za prevod |
|---|---|
| `League.tsx` | `league_seasons` ×2 (seznam + `.eq('id')`); `users` `.in('id', cjIds)` **pusti** — id-ji prihajajo iz že filtriranega starša |
| `Tournament.tsx` | `tournaments` ×2 |
| `Series.tsx` | `tournament_series` ×2 |
| `Calendar.tsx` | `calendar_events` ×1 |
| `Home.tsx` | `tournaments` ×2, `users` ×1 (števec igralcev), `calendar_events` ×1 |
| `StatsAndArchive.tsx` | `tournaments` ×1 |
| `PlayerDetail.tsx` | `users` `.eq('id', id).single()` |

Po vsaki datoteki preveri pripadajočo stran v brskalniku.

- [ ] **Korak 4: Preveri celoten javni obhod**

`/si` · `/si/klubi` · klub · igralec · `/si/liga` · sezona · zapisnik tekme ·
`/si/turnirji` · `/si/statistika` · `/si/koledar` · `/si/rang` · `/si/serije`

Pričakovano: vse enako kot pred A1. Nobena stran ni prazna.

- [ ] **Korak 5: Commit**

```bash
git add src/pages
git commit -m "feat: javne strani filtrirajo korenske tabele po drzavi"
```

---

## Naloga 17: Prevedi pomožne module in admin strani

**Files:**
- Modify: `src/lib/rangLestvica.ts`, `src/lib/series.ts`, `src/lib/tournamentPlayers.ts`,
  `src/lib/knockoutDraw.ts`, `src/lib/playerNames.ts`
- Modify: `src/pages/admin/ClubAdmin.tsx`, `LeagueAdmin.tsx`, `TournamentAdmin.tsx`,
  `TournamentEdit.tsx`, `SeriesAdmin.tsx`, `SeriesEdit.tsx`, `UserAdmin.tsx`,
  `PlayerImport.tsx`, `LeagueMatchScoresheet.tsx`

- [ ] **Korak 1: Pomožni moduli dobijo `countryId` kot argument**

Ti moduli niso React komponente in do konteksta ne morejo. Državo dobijo
izrecno — enako pravilo kot za skripte.

Vzorec: vsaka izvožena funkcija, ki poizveduje po korenski tabeli, dobi
`countryId` kot **zadnji parameter**, in ga poda naprej v `fromCountry`.

```typescript
// vzorec — velja za vsako izvoženo funkcijo v teh modulih
export async function nekaFunkcija(seasonId: string, countryId: string) {
  //  prej: supabase.from('league_seasons').select(...)
  //  zdaj: fromCountry('league_seasons', countryId).select(...)
  //
  //  prej: supabase.from('tournaments').select(...)
  //  zdaj: fromCountry('tournaments', countryId).select(...)
  //
  //  PUSTI NESPREMENJENO: supabase.from('users').select('id, gender').in('id', ids)
  //  — id-ji prihajajo iz že filtriranih staršev, filter bi bil odveč.
}
```

Konkretno po datotekah:

| Datoteka | Prevedi | Pusti |
|---|---|---|
| `rangLestvica.ts` | `league_seasons`, `tournaments` | `users` ×3 (vse `.in('id', …)`) |
| `series.ts` | `tournaments` | `users` (`.in('id', ids)`) |
| `tournamentPlayers.ts` | — | `users` (iskanje po id-jih) |
| `knockoutDraw.ts` | `tournaments` (`.eq('id', tournamentId)`) | — |
| `playerNames.ts` | — | `users` (`.in('id', uuids)`) |

`tournamentPlayers.ts` in `playerNames.ts` torej sprememb **ne** potrebujeta —
gresta pa v `ALLOWLIST` stražnega testa (naloga 19) z razlogom
`'iskanje po id-jih iz ze filtriranega starsa'`.

Klicna mesta posodobi tako, da podajo `countryId` iz `useCountry()`.

- [ ] **Korak 2: Admin strani dobijo državo iz profila**

```tsx
// vzorec za vsako admin stran
import { useAuth } from '../../contexts/AuthContext'
import { useCountry } from '../../contexts/CountryContext'
import { fromCountry } from '../../lib/fromCountry'

const { profile } = useAuth()
const { activeCountries } = useCountry()

// Admin ureja svojo državo; super_admin izbere.
const adminCountryId = profile?.role === 'super_admin'
  ? selectedCountryId          // iz preklopnika, glej korak 3
  : profile?.admin_country_id ?? profile?.country_id

// nato vse poizvedbe na korenske tabele:
fromCountry('clubs', adminCountryId!).select('*').order('name')
```

Vstavki (`insert`) `country_id` dobijo samodejno prek `fromCountry`.

- [ ] **Korak 3: Preklopnik države za `super_admin`**

Da ga ne podvajaš po admin straneh, gre v svoj modul.

```tsx
// src/lib/useAdminCountry.ts
import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useCountry } from '../contexts/CountryContext'

const KEY = 'balinar.adminCountry'

/**
 * Država, ki jo trenutni admin ureja.
 * - admin: njegova lastna, brez izbire
 * - super_admin: izbrana v preklopniku (shranjena v localStorage)
 */
export function useAdminCountry() {
  const { profile } = useAuth()
  const { activeCountries } = useCountry()
  const isSuper = profile?.role === 'super_admin'

  const [selected, setSelected] = useState<string | null>(
    () => localStorage.getItem(KEY),
  )

  useEffect(() => {
    if (selected) localStorage.setItem(KEY, selected)
  }, [selected])

  const countryId = isSuper
    ? (selected ?? activeCountries[0]?.id ?? null)
    : (profile?.admin_country_id ?? profile?.country_id ?? null)

  return {
    countryId,
    canChoose: isSuper && activeCountries.length > 1,
    options: activeCountries,
    setCountryId: setSelected,
  }
}
```

```tsx
// src/components/AdminCountrySwitcher.tsx
import { useAdminCountry } from '../lib/useAdminCountry'

export default function AdminCountrySwitcher() {
  const { countryId, canChoose, options, setCountryId } = useAdminCountry()
  if (!canChoose) return null
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-gray-500">Urejam državo:</span>
      <select
        value={countryId ?? ''}
        onChange={e => setCountryId(e.target.value)}
        className="rounded border border-gray-300 bg-white px-2 py-1"
      >
        {options.map(c => (
          <option key={c.id} value={c.id}>{c.name_sl}</option>
        ))}
      </select>
    </label>
  )
}
```

V `AdminDashboard.tsx` vstavi `<AdminCountrySwitcher />` v glavo. V admin
straneh iz koraka 2 zamenjaj ročno izpeljavo `adminCountryId` s klicem
`const { countryId: adminCountryId } = useAdminCountry()`.

- [ ] **Korak 4: Dodaj `admin_country_id` v profil**

V `src/types.ts` dopolni `UserProfile`:

```typescript
country_id: string
admin_country_id: string | null
registration_number: string | null
```

`AuthContext.fetchProfile` bere `select('*')`, zato dodatnih sprememb ni.

- [ ] **Korak 5: Preveri**

Run: `npm run typecheck && npm run dev`

Prijavi se kot admin, odpri vsako admin stran, ustvari testni klub in ga
pobriši. Pričakovano: klub dobi `country_id` samodejno.

```sql
select name, country_id from clubs order by created_at desc limit 3;
```

- [ ] **Korak 6: Commit**

```bash
git add src/lib src/pages/admin src/components/AdminCountrySwitcher.tsx src/types.ts
git commit -m "feat: pomozni moduli in admin strani filtrirajo po drzavi"
```

---

## Naloga 18: `api/import-players.ts` — izrecna država

Skripta, ki privzame Slovenijo, je natanko tista, ki bo hrvaške igralce nekoč
vpisala v slovenski register. **Brez privzetka.**

**Files:**
- Modify: `api/import-players.ts`

- [ ] **Korak 1: Zahtevaj `countryId` v zahtevku**

```typescript
// api/import-players.ts
// V shemi telesa zahtevka dodaj obvezno polje:
if (!body.countryId || typeof body.countryId !== 'string') {
  return res.status(400).json({
    error: 'Manjka countryId. Uvoz mora izrecno navesti državo — privzetka ni.',
  })
}

// Preveri, da država obstaja.
const { data: country } = await sb.from('countries')
  .select('id').eq('id', body.countryId).maybeSingle()
if (!country) return res.status(400).json({ error: 'Neznana država.' })

// Preveri, da klicatelj sme uvažati v to državo.
const { data: caller } = await sb.from('users')
  .select('role, admin_country_id').eq('id', userData.user.id).single()
const allowed = caller?.role === 'super_admin'
  || (caller?.role === 'admin' && caller.admin_country_id === body.countryId)
if (!allowed) return res.status(403).json({ error: 'Ni pravic za uvoz v to državo.' })

// Vse poizvedbe na clubs in users dobijo .eq('country_id', body.countryId),
// vsi insert-i pa country_id: body.countryId.
// Posebej pomembno pri iskanju obstoječih:
//   .from('users').select('id, club_id').eq('emso', p.emso)
//     → .eq('emso', p.emso).eq('country_id', body.countryId)
//   .from('clubs').select('id').ilike('name', clubName)
//     → .ilike('name', clubName).eq('country_id', body.countryId)
```

- [ ] **Korak 2: Pošlji `countryId` iz `PlayerImport.tsx`**

```tsx
const { profile } = useAuth()
const importCountryId = profile?.role === 'super_admin'
  ? selectedCountryId
  : profile?.admin_country_id ?? profile?.country_id

// v telesu zahtevka:
body: JSON.stringify({ ...obstojece, countryId: importCountryId })
```

- [ ] **Korak 3: Preveri tipe**

Run: `npm run typecheck:api && npm run typecheck`
Pričakovano: brez napak.

- [ ] **Korak 4: Preveri uvoz s testno datoteko**

Uvozi eno vrstico s **sintetičnimi** podatki prek `/admin/uvoz-igralcev`.

```sql
select full_name, country_id from users order by created_at desc limit 2;
```

Pričakovano: `country_id` je SI. Nato testnega igralca pobriši.

- [ ] **Korak 5: Commit**

```bash
git add api/import-players.ts src/pages/admin/PlayerImport.tsx
git commit -m "feat(api): uvoz igralcev zahteva izrecen countryId, brez privzetka"
```

---

## Naloga 19: Stražni test proti nefiltriranim poizvedbam

To je tisto, kar drži disciplino, ko boš čez pol leta dodajal Srbijo in se ne
boš spomnil tega načrta.

**Files:**
- Create: `src/guards/rootTableQueries.test.ts`

- [ ] **Korak 1: Napiši test**

```typescript
// src/guards/rootTableQueries.test.ts
// Korenske tabele nosijo country_id in morajo iti skozi fromCountry().
// Ta test pade, če se kje pojavi surov supabase.from('<korenska tabela>').
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT_TABLES = [
  'clubs', 'users', 'league_seasons',
  'tournaments', 'tournament_series', 'calendar_events',
]

/**
 * Datoteke, ki smejo brati korenske tabele neposredno, z razlogom.
 * Vsak nov vnos tu je odločitev, ne obvod — utemelji ga v komentarju.
 */
const ALLOWLIST: Record<string, string> = {
  'src/lib/fromCountry.ts':
    'sama ovojnica',
  'src/contexts/AuthContext.tsx':
    'lasten profil po auth uid — uporabnik ni vezan na trenutno izbrano državo',
  'src/contexts/CountryContext.tsx':
    'bere countries, ne korenskih tabel',
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) { walk(p, out); continue }
    if (/\.(ts|tsx)$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p)
  }
  return out
}

describe('korenske tabele gredo skozi fromCountry()', () => {
  it('nima surovih supabase.from() na korenskih tabelah', () => {
    const root = join(__dirname, '..', '..')
    const files = [...walk(join(root, 'src')), ...walk(join(root, 'api'))]
    const offenders: string[] = []

    for (const file of files) {
      const rel = relative(root, file).replace(/\\/g, '/')
      if (ALLOWLIST[rel]) continue
      const src = readFileSync(file, 'utf8')
      for (const t of ROOT_TABLES) {
        const re = new RegExp(`\\.from\\(\\s*['"\`]${t}['"\`]\\s*\\)`, 'g')
        const hits = src.match(re)
        if (hits) offenders.push(`${rel}: ${hits.length}× .from('${t}')`)
      }
    }

    expect(offenders, [
      'Najdene surove poizvedbe na korenske tabele.',
      'Uporabi fromCountry(tabela, countryId) — sicer se države pomešajo.',
      'Če je izjema upravičena, jo dodaj v ALLOWLIST z razlogom.',
      '', ...offenders,
    ].join('\n')).toEqual([])
  })
})
```

- [ ] **Korak 2: Poženi**

Run: `npm test -- src/guards/rootTableQueries.test.ts`

Pričakovano: PASS. Če pade, izpis navede točne datoteke — prevedi jih na
`fromCountry` (naloge 16–18) ali dodaj v `ALLOWLIST` z razlogom.

**Pozor:** `api/import-players.ts` uporablja service-role odjemalca in ne more
skozi `fromCountry`. Ker vsaki poizvedbi izrecno dodaja `.eq('country_id', ...)`
(naloga 18), ga dodaj v `ALLOWLIST` z razlogom
`'service-role odjemalec; drzavo dodaja izrecno, glej nalogo 18'`.

- [ ] **Korak 3: Poženi celoten paket testov**

Run: `npm test -- --run`
Pričakovano: vsi testi zeleni, vključno z obstoječimi v `src/engines/`.

- [ ] **Korak 4: Commit**

```bash
git add src/guards/rootTableQueries.test.ts
git commit -m "test: strazni test proti nefiltriranim poizvedbam na korenske tabele"
```

---

# FAZA IV — ZAKLJUČEK

## Naloga 20: Domenska preslikava

**Files:**
- Modify: `src/lib/countries.ts` (le, če se domena razlikuje od predvidene)

- [ ] **Korak 1: Preveri lokalno, brez nakupa domene**

Dodaj v `C:\Windows\System32\drivers\etc\hosts` (potrebuje skrbniške pravice):

```
127.0.0.1 bocanje.top
```

V `vite.config.ts` dovoli gostitelja:

```typescript
server: { host: true, allowedHosts: ['bocanje.top'] }
```

- [ ] **Korak 2: Preveri**

Run: `npm run dev`

Začasno v Supabase: `update countries set is_active = true where code='hr'`.

Odpri `http://bocanje.top:5173/klubi`.
Pričakovano: hrvaški prostor **brez predpone v poti**, prazna stanja (hrvaških
podatkov še ni), preklopnika države ni videti.

Odpri `http://localhost:5173/hr/klubi`.
Pričakovano: ista vsebina, s predpono v poti.

Nato **vrni**: `update countries set is_active = false where code='hr'`.

- [ ] **Korak 3: Odstrani lokalni obvod**

Pobriši vnos iz `hosts`. `allowedHosts` v `vite.config.ts` lahko ostane.

- [ ] **Korak 4: Commit**

```bash
git add vite.config.ts
git commit -m "chore: dovoli bocanje.top kot razvojnega gostitelja"
```

---

## Naloga 21: Odstrani prehodni privzetek

Privzetek, ki ostane, je tihi tovornjak podatkov v napačno državo.

**Files:**
- Create: `supabase/migrations/2026-07-19_drop_country_default.sql`

- [ ] **Korak 1: Preveri, da noben pisec ne računa na privzetek**

Run:
```bash
grep -rn "insert" src/lib/fromCountry.ts
grep -rn "country_id" api/import-players.ts
```

Pričakovano: `fromCountry.insert` dodaja `country_id`, `import-players.ts` prav
tako. Poišči še morebitne surove vstavke:

```bash
grep -rn "\.insert(" src/ api/ | grep -E "clubs|users|league_seasons|tournaments|tournament_series|calendar_events"
```

Pričakovano: vsi gredo skozi `fromCountry` ali izrecno navajajo `country_id`.

- [ ] **Korak 2: Napiši migracijo**

```sql
-- A1: odstrani prehodni privzetek iz 2026-07-19_country_id_notnull.sql.
-- Od tu naprej mora vsak vstavek državo navesti izrecno; sicer pade na not null,
-- kar je namerno — glasna napaka je boljša od tihega vpisa v napačno državo.
alter table public.clubs             alter column country_id drop default;
alter table public.users             alter column country_id drop default;
alter table public.league_seasons    alter column country_id drop default;
alter table public.tournaments       alter column country_id drop default;
alter table public.tournament_series alter column country_id drop default;
alter table public.calendar_events   alter column country_id drop default;
```

- [ ] **Korak 3: Poženi in preveri**

```sql
select table_name, column_default from information_schema.columns
where column_name='country_id' and table_schema='public' order by table_name;
```

Pričakovano: 6 vrstic, `column_default` povsod `null`.

- [ ] **Korak 4: Preveri, da vstavljanje še dela**

V aplikaciji ustvari testni klub prek `/admin/klubi`. Pričakovano: uspe in ima
`country_id`. Nato ga pobriši.

- [ ] **Korak 5: Commit**

```bash
git add supabase/migrations/2026-07-19_drop_country_default.sql
git commit -m "chore(db): odstrani prehodni privzetek country_id"
```

---

## Naloga 22: Zaključno preverjanje

**Files:** brez sprememb — samo preverbe.

- [ ] **Korak 1: Nič slovenskega ni izginilo**

Run: `node scripts/db-query.cjs`

Pričakovano: števci **identični** izhodiščnim iz naloge 1.

```sql
select 'clubs' t, count(*) n from clubs where country_id is null
union all select 'users', count(*) from users where country_id is null
union all select 'league_seasons', count(*) from league_seasons where country_id is null
union all select 'tournaments', count(*) from tournaments where country_id is null
union all select 'tournament_series', count(*) from tournament_series where country_id is null
union all select 'calendar_events', count(*) from calendar_events where country_id is null;
```

Pričakovano: vseh šest `n = 0`.

- [ ] **Korak 2: Admin meja drži**

Run: `node scripts/check-country-isolation.cjs`
Pričakovano: `5/5 preverb uspesnih`.

- [ ] **Korak 3: Stare povezave delujejo**

Vzemi resničen uuid iz baze:

```sql
select id from league_fixtures limit 1;
```

Odpri `http://localhost:5173/liga/tekma/<ta-uuid>`.
Pričakovano: preusmeri na `/si/liga/tekma/<uuid>` in pokaže **isti zapisnik** kot
pred A1.

- [ ] **Korak 4: Prazna država ne razpade**

To je najpomembnejši test A1 — v tem stanju bo Hrvaška živela ves podprojekt B.

Začasno: `update countries set is_active = true where code='hr'`.

Obišči `/hr` · `/hr/klubi` · `/hr/liga` · `/hr/turnirji` · `/hr/statistika` ·
`/hr/koledar` · `/hr/rang` · `/hr/serije`.

Pričakovano na **vsaki**: pošteno prazno stanje. **Ne** vrteče kolesce, **ne**
strta stran, **ne** slovenski podatki. Odpri konzolo brskalnika — brez napak.

Kar razpade, popravi zdaj; to je natanko okvara, ki bi sicer priletela sredi
uvoza hrvaških podatkov.

Nato **vrni**: `update countries set is_active = false where code='hr'`.

- [ ] **Korak 5: Celoten paket testov in gradnja**

Run: `npm test -- --run && npm run typecheck && npm run typecheck:api && npm run build`
Pričakovano: vse zeleno.

- [ ] **Korak 6: Ročni obhod slovenskega dela**

`/si` · `/si/klubi` · klub s člani · igralec · `/si/liga` · sezona z lestvico ·
zapisnik tekme · `/si/turnirji` · turnir · `/si/statistika` · `/si/arhiv` ·
`/si/rang` · `/si/koledar` · `/si/serije`

Pričakovano: vse enako kot pred A1.

- [ ] **Korak 7: Commit in PR**

```bash
git add -A
git commit -m "chore: zakljucno preverjanje A1"
git push -u origin vecdrzavni-temelj-a1
gh pr create --title "A1: vecdrzavni temelj (country_id, poti /si /hr, admin pravice po drzavi)" --body "$(cat <<'EOF'
## Kaj

Temelj za večdržavni balinar.app. Nobenih hrvaških podatkov — samo dimenzija
države, usmerjanje in pravice.

- `countries` + `country_id` na šestih korenskih tabelah (otroci dedujejo)
- poti `/si`, `/hr` + preusmeritve starih povezav + domenska preslikava
- `fromCountry()` ovojnica + stražni test proti nefiltriranim poizvedbam
- `admin_country_id` + RLS: admin ne doseže podatkov druge države
- pogled `users_sensitive`: osebni podatki le za lastno državo

## Preverjeno

- števci pred/po migraciji identični, `country_id is null` nikjer
- `scripts/check-country-isolation.cjs` — 5/5, neposredno proti bazi
- stare povezave (`/liga/tekma/<uuid>`) preusmerijo in delujejo
- `/hr` z aktivno a prazno državo — pošteno prazna stanja, brez napak v konzoli
- celoten paket testov, typecheck, build

## Naslednje

A2 (ločitev `players` od `auth.users`), nato B (uvoz HR klubov in igralcev).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Naloga 23: Počisti varnostne kopije

**Šele po potrditvi A1 v produkciji.** Ne prej.

- [ ] **Korak 1: Potrdi, da produkcija dela**

Vsaj en dan normalne rabe brez pritožb.

- [ ] **Korak 2: Odstrani kopije**

```sql
drop table if exists _bak_a1_clubs_20260719;
drop table if exists _bak_a1_users_20260719;
drop table if exists _bak_a1_league_seasons_20260719;
drop table if exists _bak_a1_tournaments_20260719;
drop table if exists _bak_a1_tournament_series_20260719;
drop table if exists _bak_a1_calendar_events_20260719;
drop table if exists _bak_a1_matches_20260719;
```

- [ ] **Korak 3: Commit**

```bash
git rm supabase/migrations/2026-07-19_00_backup.sql
git commit -m "chore: odstrani varnostne kopije po potrditvi A1"
```

---

## Zunaj obsega A1

- Hrvaški podatki, scraper, PDF razčlenjevalnik (B, C, D)
- Ločitev `players` od `auth.users` (A2)
- Poln admin UI za več držav — shema in politike so tu, UI ne
- Prevod vmesnika v hrvaščino; vmesnik ostane slovenski tudi na `/hr`
- Hrvaška vizualna podoba za `bocanje.top`
- Nakup in DNS nastavitev domene `bocanje.top`
- Čiščenje `users.license_number` (razsuta starina — glej spec)
