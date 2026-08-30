-- POVRATEK za 20260830_01_users_obz_reg_number.sql
--
-- Ni del rednega zaporedja migracij. Pognati ROČNO v Supabase SQL editorju.
--
-- POZOR: to izbriše VSE registrske številke območnih zvez. Pred zagonom jih
-- izvozi, sicer jih ni od kod dobiti nazaj razen s ponovnim prepisom obrazcev:
--   select id, full_name, club, obz_reg_number from public.users
--   where obz_reg_number is not null;

drop index if exists public.idx_users_obz_reg_number;

-- Pogled najprej, ker se sklicuje na stolpec.
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

alter table public.users drop column if exists obz_reg_number;
