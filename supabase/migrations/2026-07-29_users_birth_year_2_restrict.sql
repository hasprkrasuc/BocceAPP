-- Varnost, drugi del (KORAK 2 od 2): poln datum rojstva in številka licence
-- nista več javna.
--
-- ⚠️ Pogoj: koda iz tega PR mora biti ŽE v produkciji (bere `birth_year`).
-- Ta migracija odvzame `date_of_birth` in `license_number` javnima vlogama;
-- stara koda, ki ju še bere prek USER_PUBLIC_COLS, bi po tem dobila 401.
--
-- Zakaj sploh: poln datum rojstva je osebni podatek, številka licence pa
-- identifikator iz nacionalnega registra. Javnim stranem ne prinašata nič, kar
-- ne bi povedala letnica — prikaz "r. 1990", letnik in upravičenost do dvojne
-- registracije so vsi po letniku (`isAgeEligible`: `refYear - letnica <= meja`).

-- ─────────────────────────────────────────────────────────────
-- 1) Javni nabor stolpcev: brez date_of_birth in license_number
--    Ujema se z USER_PUBLIC_COLS v src/lib/userColumns.ts.
-- ─────────────────────────────────────────────────────────────
revoke select on public.users from anon;
grant select (
  id, full_name, club, club_id, role, birth_year, gender, photo_url
) on public.users to anon;

revoke select on public.users from authenticated;
grant select (
  id, full_name, club, club_id, role, birth_year, gender, photo_url
) on public.users to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2) Pogled dobi še birth_year, da lasten profil in admin vidita oboje
-- ─────────────────────────────────────────────────────────────
drop view if exists public.users_sensitive;

create view public.users_sensitive
with (security_barrier = true)
as
  select u.id, u.full_name, u.club, u.club_id, u.role,
         u.birth_year, u.gender, u.photo_url,
         u.license_number, u.date_of_birth,
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
