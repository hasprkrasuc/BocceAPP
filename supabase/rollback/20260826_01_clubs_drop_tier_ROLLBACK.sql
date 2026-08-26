-- POVRATEK za 20260826_01_clubs_drop_tier.sql
--
-- Ni del rednega zaporedja migracij. Pognati ROČNO v Supabase SQL editorju,
-- če bi se izkazalo, da clubs.tier vendarle kdo potrebuje.
--
-- KAJ TA DATOTEKA VRNE IN KAJ NE
--
-- Stolpec vrne, prejšnjih vrednosti pa NE more vrniti — z izpustom stolpca so
-- izginile. Namesto tega ga napolni iz tekoče sezone po isti logiki, ki jo
-- uporablja src/engines/klubiPoLigah.ts. Vrnjene vrednosti so torej
-- PRAVILNEJŠE od tistih pred izpustom: tam jih je bilo 8 napačnih.
--
-- Dve razliki proti prejšnjemu stanju sta neizogibni:
--
--   - Klub v več ligah (12 od 79) dobi eno samo vrednost. Izbrana je
--     najvišja liga po spodnjem vrstnem redu — ne zato, ker bi bilo to
--     pravilno, ampak ker en stolpec več od tega ne zmore.
--   - Klub brez ekipe v tekoči sezoni (prej so vsi imeli vpisan 'obz')
--     ostane null. Vpis 'obz' bi bil ugibanje.
--
-- Če potrebuješ točno prejšnje vrednosti, jih vzemi iz varnostne kopije baze
-- izpred zagona migracije; iz repozitorija jih ni mogoče obnoviti.

alter table public.clubs add column if not exists tier text;

with dejansko as (
  select distinct
         lt.club_id,
         case
           when ls.category in ('u14','u15','u12')   then 'u14'
           when ls.category in ('u18','u18_women')   then 'u18'
           when ls.tier = 'obz'                      then 'obz'
           when ls.tier = '1_liga'
            and ls.category = 'women'                then '1_liga_clanice'
           else ls.tier
         end as razdelek
  from public.league_teams lt
  join public.league_seasons ls on ls.id = lt.season_id
  where lt.club_id is not null
    and ls.status <> 'completed'
), izbrano as (
  select distinct on (club_id) club_id, razdelek
  from dejansko
  where razdelek is not null
  order by club_id,
           case razdelek
             when 'super_liga'     then 1
             when '1_liga'         then 2
             when '1_liga_clanice' then 3
             when '2_liga_vzhod'   then 4
             when '2_liga_zahod'   then 5
             when 'u18'            then 6
             when 'u14'            then 7
             when 'obz'            then 8
             else 9
           end
)
update public.clubs c
   set tier = i.razdelek
  from izbrano i
 where i.club_id = c.id
   and c.tier is distinct from i.razdelek;

-- Preveri po zagonu — pričakovano 79 klubov z vrednostjo, ostali null:
--   select count(*) filter (where tier is not null) as s_tierjem,
--          count(*) filter (where tier is null)     as brez
--   from public.clubs;
