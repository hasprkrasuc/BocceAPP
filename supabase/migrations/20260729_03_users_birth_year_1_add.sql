-- Varnost, drugi del (KORAK 1 od 2): dodaj izpeljano letnico rojstva.
--
-- Ta korak samo DODAJA. Nič ne odvzame, zato ga je varno pognati, medtem ko v
-- produkciji teče stara koda.
--
-- Zakaj dva koraka: koda, ki bere `birth_year`, potrebuje stolpec že prej,
-- stara koda pa še bere `date_of_birth` in `license_number`. Če bi dodajanje in
-- odvzem združili v eno migracijo, bi eno ali drugo padlo na 401 — ne glede na
-- to, ali gre prej koda ali migracija.
--
-- Zaporedje izdaje:
--   1. ta migracija            (stara koda dela naprej, birth_year obstaja)
--   2. deploy kode iz tega PR  (bere birth_year namesto date_of_birth)
--   3. 20260729_04_users_birth_year_2_restrict.sql  (odvzem starih stolpcev)
--
-- `date_of_birth` je `text` z dvema zapisoma (ISO "1990-01-01" in pikčasti BZS
-- "1.1.1990"). Prva skupina štirih zaporednih števk je v obeh ravno letnica.

alter table public.users
  add column if not exists birth_year integer
  generated always as ((regexp_match(date_of_birth, '\d{4}'))[1]::integer) stored;

comment on column public.users.birth_year is
  'Letnica rojstva, izpeljana iz date_of_birth. Javno berljiva; poln datum je občutljiv (users_sensitive).';

-- Samo dodatna pravica; obstoječe ostanejo nedotaknjene.
grant select (birth_year) on public.users to anon, authenticated;
