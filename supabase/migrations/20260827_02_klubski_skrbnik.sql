-- Klubski skrbnik.
--
-- ZAKAJ
--
-- Od 1446 uporabnikov jih ima 1413 naslov, ki ga je dodelila aplikacija ob
-- uvozu (@balinar.app). Ti naslovi pošte ne prejemajo, zato pri njih tudi
-- pozabljeno geslo ne deluje — povezava za ponastavitev odide v nikamor.
-- Prijavilo se je 15 ljudi od 1446.
--
-- Naslovov igralcev v bazi ni in jih zveza nima. Imajo pa jih klubi: 73 od 79
-- klubov z ekipo v tekoči sezoni ima kontaktni naslov, prek njih je dosegljivih
-- 1289 od 1319 članov (98 %). Pot naprej je torej klubski tajnik, ki svojim
-- članom vpiše prave naslove.
--
-- OBSEG (dogovorjeno z lastnikom projekta 27. 8. 2026)
--
-- Skrbnik vidi člane SVOJEGA kluba in jim sme urediti prijavo (e-naslov,
-- ponastavitev gesla), telefon in fotografijo. NE sme:
--
--   - spreminjati vlog (sicer bi si lahko naredil admina),
--   - spreminjati EMŠO, datuma rojstva in licence (vir je dokument zveze),
--   - premikati članov med klubi,
--   - brisati uporabnikov,
--   - videti EMŠO in domačih naslovov svojih članov.
--
-- Zadnje je razlog za ločen pogled `club_members` namesto razširitve
-- `users_sensitive`: tisti razkriva EMŠO, datum rojstva in cel domači naslov.
-- Klubski tajnik za vpis e-naslova tega ne potrebuje in ozka vloga pomeni tudi
-- ozek pogled.
--
-- VARNOSTNO JEDRO
--
-- Tabele club_admins skrbnik NE sme spreminjati. Če bi jo smel, bi si dodal
-- vrstico za tuj klub in si sam razširil dostop. Vpisuje jo lahko samo globalni
-- admin; skrbnik vidi le svoje vrstice, ker mora aplikacija vedeti, katere
-- klube ureja. Enako velja pri ligaškem skrbniku (20260809_01).
--
-- Sama dejanja (naslov, geslo) tečejo prek api/club-member.ts s storitveno
-- vlogo, ker živijo v auth.users. Tam je straža ponovljena — pogled sam po sebi
-- ne omejuje pisanja.

-- ── Vezava skrbnik <-> klub ─────────────────────────────────────────────────
create table if not exists public.club_admins (
  club_id    uuid not null references public.clubs(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create index if not exists idx_club_admins_user on public.club_admins(user_id);

comment on table public.club_admins is
  'Skrbnik posameznega kluba. Vpisuje ga lahko samo globalni admin (is_admin).';

alter table public.club_admins enable row level security;

drop policy if exists "Admin upravlja klubske skrbnike" on public.club_admins;
create policy "Admin upravlja klubske skrbnike" on public.club_admins
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Svoje klubske vloge vidi vsak" on public.club_admins;
create policy "Svoje klubske vloge vidi vsak" on public.club_admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ── Ali je prijavljeni skrbnik tega kluba ───────────────────────────────────
create or replace function public.is_club_admin(p_club_id uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.club_admins
    where club_id = p_club_id and user_id = auth.uid()
  );
$$;

revoke execute on function public.is_club_admin(uuid) from public, anon;
grant  execute on function public.is_club_admin(uuid) to authenticated;

-- ── Pogled: člani klubov, ki jih uporabnik ureja ────────────────────────────
-- NAMENOMA brez emso, date_of_birth, license_number in naslova. Za vpis
-- e-naslova jih tajnik ne potrebuje, razkritje pa bi bilo nesorazmerno.
--
-- security_barrier: enako kot users_sensitive. Brez tega bi lahko poizvedba s
-- funkcijo v WHERE videla vrstice, preden se pogoj pogleda uveljavi.
--
-- Pogled teče kot lastnik (postgres) in s tem obide RLS na users; edino, kar
-- omejuje vrstice, je pogoj spodaj. Zato mora biti ta pogoj pravilen.
drop view if exists public.club_members;
create view public.club_members
with (security_barrier = true)
as
  select u.id, u.full_name, u.email, u.phone, u.photo_url,
         u.role, u.birth_year, u.club_id, u.club
  from public.users u
  where u.club_id is not null
    and ((select public.is_admin()) or public.is_club_admin(u.club_id));

comment on view public.club_members is
  'Člani klubov, ki jih prijavljeni ureja kot klubski skrbnik (ali vsi, če je globalni admin). Brez EMŠO, datuma rojstva in naslova.';

grant select on public.club_members to authenticated;
