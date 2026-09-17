-- DODATNO IZBIJANJE — svoj izid, ne popravek rednega.
--
-- Prva izvedba je predvidevala, da sodnik ob izenačenju popravi izid v redni
-- seriji. To je narobe: če sta osmi in deveti izenačena na 8 zadetkih in eden
-- v dodatnem izbijanju zadene 30, bi mu popravek rednega polja rezultat
-- dvignil na 30 in bi preskočil vse pred sabo. Dodatno izbijanje sme odločiti
-- SAMO vrstni red med izenačenima.
--
-- Zato svoj stolpec. Izpolnjen je le pri izenačenih; pri primerjavi se pogleda
-- šele takrat, ko sta redna izida enaka (src/engines/izbijanje.ts).
--
-- Potrebno je na dveh mestih: na meji napredovanja (kdo gre v četrtfinale
-- oziroma finale) in v zadnji seriji, kjer izenačenje pomeni deljeno mesto na
-- stopničkah. Niže med izpadlimi ne — tam mesto odloči prejšnja serija in
-- nazadnje žrebana številka, tako kot na grafikonu DP 2025.

alter table public.izbijanje_izidi
  add column if not exists dodatno integer check (dodatno is null or dodatno >= 0);

comment on column public.izbijanje_izidi.dodatno is
  'Izid dodatnega izbijanja v tej seriji; vpisan samo pri izenačenih. Loči izenačena med sabo, na razmerje do ostalih ne vpliva.';
