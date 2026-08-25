# Postavitev novega Supabase projekta

Kako iz tega repozitorija zgraditi delujočo bazo od nič — za obnovo po izgubi,
za testno okolje ali za novo namestitev.

> **Za obstoječi projekt tega ne rabiš.** Produkcija (balinar.app) je že
> postavljena; tu opisano velja samo, kadar postavljaš **novo** bazo. Za
> vsakdanji razvoj glej [README.md](README.md), za pravila pisanja migracij
> [CONTRIBUTING.md](CONTRIBUTING.md).

Postopek je bil v celoti preverjen 7. 8. 2026 na praznem projektu: vse migracije
so se izvedle brez napake, nastala shema pa je enaka produkcijski v stolpcih,
indeksih, funkcijah, prožilcih, politikah, omejitvah in pogledih.

Do takrat je ta datoteka vsebovala celotno shemo kot en blok SQL za prilepiti.
Ta blok je bil iz prvega commita in je bil starejši od vseh migracij — imel je
tabelo `knockout_slots`, ki ne obstaja, enumeratorje namesto besedilnih
stolpcev z omejitvami CHECK in ni imel osmih tabel. Zdaj tu SQL sheme namenoma
ni: edini vir resnice so migracije.

---

## 1. Ustvari Supabase projekt

1. [supabase.com](https://supabase.com) → **New project**
2. **Database password** shrani varno — pozneje ga ni mogoče prebrati
3. **Region**: najbližja (produkcija teče v `eu-central-1`)
4. Počakaj ~2 minuti na inicializacijo

---

## 2. Zaženi migracije

**Vso shemo, pravice in prožilce ustvarijo migracije v `supabase/migrations/`.**
V tem dokumentu ni SQL-a, ki bi ga bilo treba prilepiti — bil bi drugi vir
resnice in bi zastaral, kar se je tej datoteki že enkrat zgodilo.

V Supabase → **SQL Editor** poženi **vse datoteke iz `supabase/migrations/` po
abecednem vrstnem redu**, vsako posebej in do konca, preden začneš naslednjo.

```bash
# Vrstni red, ki ga potrebuješ:
ls supabase/migrations/
```

Zakaj ravno abecedni: poimenovanje je `YYYYMMDD_NN_opis.sql`, kjer `NN` ureja
datoteke znotraj istega dne. Abecedni vrstni red je zato hkrati veljaven vrstni
red izvajanja.

Tri stvari, ki niso očitne:

- **`00_schema.sql`, `01_out_of_band_schema.sql` in
  `02_out_of_band_schema_dopolnitev.sql` so izhodišče**, ne navadne migracije.
  Prva je osnovna shema, drugi dve dokumentirata objekte, ki so nastali mimo
  repozitorija. Tečejo prve, v tem vrstnem redu.
- **Zaporedje znotraj dneva ni okras.** `20260729_02_users_pii_authenticated`
  ustvari pogled `users_sensitive`, `20260729_04_users_birth_year_2_restrict`
  pa ga pobriše in ustvari znova z `birth_year`. Ob zamenjanem vrstnem redu bi
  se baza zgradila brez napake, pogled pa bi ostal brez stolpca.
- **`supabase/rollback/` NE poganjaj.** Povratki so namenoma zunaj
  `migrations/`, prav zato da ne pridejo v zaporedje.

Migracije pokrijejo tudi prožilca na `auth.users` (`on_auth_user_created`,
`on_auth_user_email_changed`), ki ob registraciji ustvarita profil in
sinhronizirata e-pošto.

---

## 3. Ročni koraki, ki jih migracije NE pokrijejo

Po migracijah baza še ni popolna. Dvoje je treba narediti ročno.

### 3.1 Storage

Migracije ne ustvarijo nobenega vedra (bucket) ne politike nad
`storage.objects` — Supabase to hrani zunaj sheme `public`. Produkcija ima eno
javno vedro `media` (logotipi klubov, fotografije ekip, avatarji).

Supabase → **Storage** → **New bucket**:
- Name: `media`
- Public: ✓

Nato v **SQL Editor** politike nad `storage.objects`. Vse štiri so **samo za
admine** — tako je tudi v produkciji. Javno branje slik s tem ni prizadeto:
vedro je `public`, zato obiskovalci datoteke dobijo prek javnega URL-ja in ne
skozi RLS.

```sql
create policy "media beri" on storage.objects
  for select using (
    bucket_id = 'media' and exists (
      select 1 from public.users
      where users.id = auth.uid()
        and users.role = any (array['admin','super_admin'])
    )
  );

create policy "media nalozi" on storage.objects
  for insert with check (
    bucket_id = 'media' and exists (
      select 1 from public.users
      where users.id = auth.uid()
        and users.role = any (array['admin','super_admin'])
    )
  );

create policy "media posodobi" on storage.objects
  for update using (
    bucket_id = 'media' and exists (
      select 1 from public.users
      where users.id = auth.uid()
        and users.role = any (array['admin','super_admin'])
    )
  );

create policy "media zbrisi" on storage.objects
  for delete using (
    bucket_id = 'media' and exists (
      select 1 from public.users
      where users.id = auth.uid()
        and users.role = any (array['admin','super_admin'])
    )
  );
```

### 3.2 Prvi super_admin

Vloge se sicer spreminjajo izključno prek `public.set_user_role()`, ta pa
zahteva, da je klicatelj že admin. Prvega je zato treba nastaviti neposredno:

1. Registriraj se v aplikaciji (dobiš vlogo `player`)
2. Supabase → **SQL Editor**:

```sql
update public.users set role = 'super_admin' where email = 'tvoj@email.com';
```

Vse nadaljnje vloge dvigni prek **/admin/uporabniki**.

### 3.3 Ponastavitev pozabljenega gesla

Prijavni zaslon ima **Pozabljeno geslo?**, ki pošlje povezavo na `/novo-geslo`.
Da povezava sploh odide in da ob kliku ne pade, sta v Dashboardu potrebni dve
nastavitvi — migracije jih ne pokrijejo, ker živita zunaj sheme `public`.

**Supabase → Authentication → URL Configuration:**

- *Site URL*: naslov produkcije (npr. `https://balinar.app`)
- *Redirect URLs*: dodaj `https://balinar.app/novo-geslo` in — za razvoj —
  `http://localhost:5173/novo-geslo`

Brez tega Supabase povezave ne pošlje, obrazec pa pokaže napako, ki jo vrne
strežnik. Vsak preview na Vercelu ima svojo domeno, zato ponastavitev tam ne bo
delovala, dokler naslova ne dodaš posebej.

**Supabase → Project Settings → Authentication → SMTP Settings:** vgrajena pošta
je namenjena razvoju in je strogo omejena (nekaj sporočil na uro). Za resno rabo
nastavi svoj SMTP.

> **Pomembno:** od 1403 uporabnikov jih 1370 nima pravega poštnega predala — ob
> uvozu so dobili naslov oblike `ime.priimek.hash@balinar.app`, ki nikamor ne
> vodi. Tem ponastavitev po e-pošti **ne more** pomagati; obrazec jih na to
> opozori in jih napoti na skrbnika. Geslo jim mora nastaviti skrbnik.

---

## 4. Poveži aplikacijo

```bash
cp .env.example .env.local
```

Izpolni obe vrednosti iz Supabase → **Project Settings → API**:

```
VITE_SUPABASE_URL=https://<projekt>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public kljuc>
```

Anon ključ je javen — vgradi se v brskalniški bundle in ga varuje RLS.
**Service role ključ sem ne sodi** (glej opozorilo v `.env.example`).

```bash
npm install
npm run dev          # http://localhost:5173
```

Node 20 ali novejši.

---

## 5. Preveri, da baza res deluje

Shema brez napake še ne pomeni uporabne baze. Ta dimni test zajame stvari, ki
so v preteklosti tiho manjkale:

```sql
do $$
declare tid uuid;
begin
  -- turnir + skupina z velikostjo (padlo bi brez tournament_groups.group_size)
  insert into public.tournaments (name, date, location, category, status)
    values ('ZZ Test', current_date, 'X', 'men', 'draft') returning id into tid;
  insert into public.tournament_groups (tournament_id, group_number, status, group_size)
    values (tid, 1, 'pending', 4);

  -- sezone kategorij, ki jih aplikacija ponuja
  insert into public.league_seasons (name, year, category, tier)
    values ('ZZ U14', 2026, 'u14', 'obz');
  insert into public.league_seasons (name, year, category, tier)
    values ('ZZ U18Z', 2026, 'u18_women', '1_liga');

  raise exception 'ZZ_ROLLBACK';   -- namerno: vse zgoraj se razveljavi
end $$;
```

Pričakovan izid: `ERROR: ZZ_ROLLBACK`. Karkoli drugega pomeni, da je zaporedje
migracij nepopolno — najverjetneje katera ni bila izvedena do konca.

---

## 6. Kaj se s tem NE prenese

`db reset` obnovi **shemo, ne vsebine**. Nova baza je prazna: ni uporabnikov,
klubov, sezon, turnirjev ne datotek v Storage. Prav tako se ne prenesejo
nastavitve avtentikacije iz Dashboarda (ponudniki prijave, predloge e-pošte,
URL-ji preusmeritev) — te niso del sheme in jih je treba nastaviti posebej.
