-- rounds_count je STEVILO KOL, ne stevilo krogov.
--
-- Vrednost je nosila dva pomena:
--   a) obrazec sezone je vanjo pisal stevilo KROGOV (1 = enokrozno, 2 = dvokrozno)
--   b) vse ostalo jo bere kot stevilo KOL rednega dela -- calculateStandings po
--      njej odreze koncnico (round_number > rounds_count), League.tsx po njej
--      loci redni del od polfinala in finala
--
-- Generatorja za 'groups' in 'split' po generiranju vpiseta pravo stevilo kol
-- (10/16 oz. 9/14), generator za 'flat' pa ne -- tam je ostalo 1 ali 2.
--
-- Posledica na Super Ligi 2026/27 (9 ekip, dvokrozno): nastalo je pravilnih
-- 18 kol in 72 tekem, a rounds_count je ostal 2. Zato je lestvica stela samo
-- prvi dve koli, kola 3-18 pa so se prikazala kot polfinale in finale.
--
-- Popravek je dvojen: podatek se popravi, pomen pa razdvoji -- odlocitev
-- enokrozno/dvokrozno dobi svoj stolpec, da je generator ne bere vec iz
-- rounds_count (sicer bi ob ponovnem generiranju enokrozna liga z 9 koli
-- postala dvokrozna, ker je 9 > 1).

-- 1) Popravi rounds_count, kjer je ostal stevilo krogov.
--    Obrazec ponuja le 1 ali 2, zato je <= 2 zanesljiv pokazatelj; edina taka
--    sezona 7. 8. 2026 je bila Super Liga 2026/27 (2 -> 18).
update public.league_seasons s
set rounds_count = f.max_kolo
from (
  select season_id, max(round_number) as max_kolo
  from public.league_fixtures group by season_id
) f
where f.season_id = s.id
  and s.format = 'flat'
  and s.rounds_count <= 2
  and f.max_kolo > s.rounds_count;

-- 2) Odlocitev enokrozno/dvokrozno dobi svoj stolpec. Velja samo za 'flat';
--    'groups' ima dvokrozno fazo 1 po pravilih, 'split' pa enokrozno.
alter table public.league_seasons
  add column if not exists double_round boolean not null default false;

comment on column public.league_seasons.double_round is
  'Samo format=flat: true = dvokrozno (dom + gost), false = enokrozno. Loceno od rounds_count, ki je stevilo kol rednega dela.';

-- 3) Backfill: dvokrozna je sezona, ki ima vec kol, kot jih zahteva en krog.
--    En krog = N-1 kol pri sodem stevilu ekip, N pri lihem (ena vsako kolo pociva).
update public.league_seasons s
set double_round = true
where s.format = 'flat'
  and exists (select 1 from public.league_teams t where t.season_id = s.id)
  and s.rounds_count > (
    select case when count(*) % 2 = 0 then count(*) - 1 else count(*) end
    from public.league_teams t where t.season_id = s.id
  );
