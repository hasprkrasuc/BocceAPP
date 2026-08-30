-- Registrska številka območne zveze (`obz_reg_number`) dobi svoj stolpec.
--
-- ZAKAJ NE V license_number
--
-- Obrazci "Evidenca in registracija igralcev po klubih" območnih zvez imajo
-- stolpec "Reg. št.". 29. 8. 2026 sem jo ob uvozu 18 klubov OBZ Ljubljana
-- zapisal v `license_number`, ker se razpona ujemata — obstoječe licenčne
-- številke gredo od 1 do 3470, Reg. št. na obrazcih od 21 do 3475. Ujemanje
-- razpona je bilo namig, ne dokaz, in izkazalo se je za napačno:
--
--   3472 — Peter Tonejc (Mengeš Rakoll)  IN  Ratomir Matović (Tivoli)
--   3473 — Erik Kandare (Mengeš Rakoll)  IN  Toma Pavlić (Tivoli)
--
-- Dve zaporedni številki, vsaka deljena med igralcema dveh različnih klubov.
-- To nista podvojena zapisa iste osebe, ampak dve ločeni zaporedji. Uvoz je
-- tako ustvaril 15 novih trkov; 30. 8. 2026 so bile te vrednosti pobrisane
-- (177 zapisov), ta stolpec pa je mesto, kamor sodijo.
--
-- ZAKAJ NI UNIKATEN
--
-- Prav zgornji primer pokaže, da ista Reg. št. lahko pripada dvema osebama.
-- Unikatni indeks bi uvoz podrl, namesto da bi podatek shranil. Kadar bo
-- treba trke najti, jih najde poizvedba, ne omejitev.
--
-- OBČUTLJIVOST
--
-- Stolpec je enake vrste kot `license_number`: ni za javne strani. Na
-- `public.users` sta SELECT za `anon` in `authenticated` omejena po stolpcih
-- (USER_PUBLIC_COLS), zato nov stolpec ni samodejno bran — REVOKE spodaj je
-- varovalka za primer, da bi kdaj kdo dodelil pravico nad celo tabelo.
-- Lastniku profila in adminu je dosegljiv prek pogleda `users_sensitive`.

alter table public.users
  add column if not exists obz_reg_number text;

comment on column public.users.obz_reg_number is
  'Registrska številka območne balinarske zveze ("Reg. št." z registracijskih obrazcev). NI isto kot license_number — številki sta iz ločenih zaporedij in nista unikatni.';

-- Iskanje po številki (npr. ob uvozu ali iskanju trkov). Delni indeks, ker je
-- stolpec pri veliki večini zapisov prazen.
create index if not exists idx_users_obz_reg_number
  on public.users (obz_reg_number)
  where obz_reg_number is not null;

-- Varovalka: nov stolpec ne sme biti javno berljiv.
revoke select (obz_reg_number) on public.users from anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- POŽENI KOT `postgres`. Pogled bere stolpce, ki jih vloga `authenticated` na
-- `public.users` ne sme brati; deluje zato, ker teče s pravicami lastnika.
-- Če ga ustvari kdo drug, postane on lastnik in pogled neha vračati vrstice.
--
-- Pogled dobi nov stolpec, da ga vidita lastnik profila in admin.
-- Seznam stolpcev je naštet izrecno (kot doslej): `select *` bi ob vsakem
-- novem stolpcu na users tega tiho pripeljal tudi v pogled.
-- ─────────────────────────────────────────────────────────────
drop view if exists public.users_sensitive;

create view public.users_sensitive
with (security_barrier = true)
as
  select u.id, u.full_name, u.club, u.club_id, u.role,
         u.birth_year, u.gender, u.photo_url,
         u.license_number, u.obz_reg_number, u.date_of_birth,
         u.email, u.phone, u.emso,
         u.birth_city, u.birth_country, u.citizenship,
         u.address_street, u.address_house, u.address_postal,
         u.address_city, u.address_country
  from public.users u
  where u.id = (select auth.uid())
     or (select public.is_admin());

comment on view public.users_sensitive is
  'Osebni podatki uporabnikov, omejeni na lasten profil ali admina. Javne strani berejo public.users z USER_PUBLIC_COLS.';

revoke all on public.users_sensitive from anon, public;
grant select on public.users_sensitive to authenticated;
