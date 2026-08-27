-- Pari, za katere je človek ugotovil, da NISTA dvojnika.
--
-- Samodejno predlaganje (src/engines/dvojniki.ts) najde pare po ujemanju imena.
-- Šest od osmih najdenih na produkciji je različnih ljudi in bo tam viselo za
-- vedno: Ivan Ličan 1964 in 1961 sta v istem klubu dva človeka, prav tako Igor
-- Turk 1992 in 1975, Anton Anže Trobec pa je sin Antona Trobca. Ker se ti pari
-- ne bodo nikoli razrešili sami, jih mora biti mogoče utišati — sicer plošča
-- postane šum, ki ga nihče več ne bere, in v njem se izgubi pravi dvojnik.
--
-- ZAKAJ PAR IN NE ZASTAVICA NA UPORABNIKU
--
-- »Ni dvojnik« je lastnost PARA, ne osebe. Ivan Ličan (1964) ni dvojnik Ivana
-- Ličana (1961), lahko pa se jutri pojavi tretji zapis, ki JE njegov dvojnik.
-- Zastavica na uporabniku bi utišala tudi tistega.
--
-- UREJEN PAR
--
-- Brez omejitve `id_a < id_b` bi isti par lahko obstajal dvakrat, enkrat v vsaki
-- smeri, in bi ga utišanje v eni smeri pustilo vidnega v drugi. Enak vrstni red
-- dela odjemalec (kljucPara v dvojniki.ts).
--
-- BRIS
--
-- Oba tuja ključa sta CASCADE: ko se zapis ob združitvi pobriše, par preneha
-- obstajati in oznaka gre z njim. Brez tega bi ostala vrstica, ki kaže na
-- nekoga, ki ga ni.
--
-- Poimenovanje je slovensko, kot funkcija `zdruzi_uporabnika` in motor
-- `dvojniki.ts` — starejše tabele so angleške, a ta sodi k tej trojici.

create table if not exists public.preverjeni_dvojniki (
  id_a       uuid not null references public.users(id) on delete cascade,
  id_b       uuid not null references public.users(id) on delete cascade,
  -- Kdo je označil. SET NULL, ker oznaka velja naprej tudi, če ta človek odide.
  oznacil    uuid references public.users(id) on delete set null,
  opomba     text,
  created_at timestamptz not null default now(),
  primary key (id_a, id_b),
  constraint preverjeni_dvojniki_urejen_par check (id_a < id_b)
);

-- id_a pokriva vodilni stolpec primarnega ključa, id_b pa ne — brez tega bi
-- moral bris uporabnika prebrati celotno tabelo (glej 20260729_01_perf_fk_indexes).
create index if not exists idx_preverjeni_dvojniki_b
  on public.preverjeni_dvojniki(id_b);

alter table public.preverjeni_dvojniki enable row level security;

-- Samo admin. Tabela je skrbniška opomba in nikogar drugega ne zadeva; navadni
-- uporabnik iz nje ne bi mogel razbrati ničesar koristnega, lahko pa bi videl,
-- kdo je bil kdaj osumljen dvojnika.
drop policy if exists "Admin upravlja preverjene dvojnike" on public.preverjeni_dvojniki;
create policy "Admin upravlja preverjene dvojnike" on public.preverjeni_dvojniki
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

comment on table public.preverjeni_dvojniki is
  'Pari zapisov, za katere je admin potrdil, da NISTA ista oseba. Skrije jih s plošče možnih dvojnikov.';
