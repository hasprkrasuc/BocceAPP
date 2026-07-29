-- Varnost: osebni podatki v `users` so dostopni vsakemu prijavljenemu uporabniku.
--
-- Stanje pred to migracijo:
--   - `20260628_restrict_users_pii_from_anon.sql` je občutljive stolpce odvzel
--     samo vlogi `anon`.
--   - Vloga `authenticated` ima privzete Supabase pravice na celotni tabeli,
--     politika `"Javno branje" for select using (true)` pa ne omejuje vrstic.
--   → Vsak registriran igralec lahko z anon ključem in svojo sejo požene
--     `select emso,email,phone,address_street from users` in dobi te podatke
--     za VSEH ~1175 uporabnikov. To ni admin funkcija, ampak vsak račun.
--
-- Popravek ima dva dela:
--   1) `authenticated` dobi enak ozek nabor stolpcev kot `anon`.
--   2) Občutljivi stolpci gredo skozi pogled `users_sensitive`, ki vrstice
--      omeji na lasten profil ali na admina.
--
-- Stolpčnih pravic ni mogoče vezati na vrstico, zato pogled: navaden pogled se
-- izvede s pravicami lastnika, filter v njegovem `where` pa je tisti, ki mejo
-- dejansko postavi. `security_barrier` prepreči, da bi se uporabnikov predikat
-- izvedel pred njim.
--
-- ⚠️ VRSTNI RED IZDAJE: koda, ki bere `users` z izrecnimi stolpci (ta PR), gre
-- v produkcijo PRED to migracijo ali hkrati z njo. Sicer PostgREST za
-- `select=*` vrne 401 in profil ter admin strani se pokvarijo — isto opozorilo
-- kot v glavi 20260628_restrict_users_pii_from_anon.sql.

-- ─────────────────────────────────────────────────────────────
-- 1) Je trenutni uporabnik admin?
--    (`create or replace` — enaka definicija je tudi v
--     2026-07-29_perf_rls_initplan.sql, zato je vrstni red uvedbe vseeno.)
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role = any (array['admin','super_admin'])
  );
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- ─────────────────────────────────────────────────────────────
-- 2) authenticated: enak ozek nabor stolpcev kot anon
--    (ujema se z USER_PUBLIC_COLS v src/lib/userColumns.ts)
-- ─────────────────────────────────────────────────────────────
revoke select on public.users from authenticated;

grant select (
  id, full_name, club, club_id, role, license_number, date_of_birth, gender, photo_url
) on public.users to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3) Občutljivi stolpci prek vrstično omejenega pogleda
-- ─────────────────────────────────────────────────────────────
drop view if exists public.users_sensitive;

create view public.users_sensitive
with (security_barrier = true)
as
  select u.id, u.full_name, u.club, u.club_id, u.role, u.license_number,
         u.date_of_birth, u.gender, u.photo_url,
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
