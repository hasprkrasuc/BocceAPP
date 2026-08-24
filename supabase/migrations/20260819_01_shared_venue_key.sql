-- Dve ekipi si lahko delita (rezervno) igrišče. Takrat ne smeta biti nikoli obe
-- domači v istem krogu, sicer igrišče ne zadošča. To zagotovi razlika med
-- njunima žrebanima številkama (pri sodem številu ekip N/2; izpelje jo
-- veljavniPariIgrisc iz Bergerjeve tabele).
--
-- Ekipe z enakim ključem si delijo igrišče. Ključ je prosto besedilo, ker gre
-- lahko za balinišče, ki ni vezano na klub. NULL = ekipa igrišča ne deli.
ALTER TABLE public.league_teams
  ADD COLUMN IF NOT EXISTS shared_venue_key text;

COMMENT ON COLUMN public.league_teams.shared_venue_key IS
  'Ekipe z enakim kljucem si delijo rezervno igrisce in ne smeta biti obe domaci v istem krogu. NULL = ekipa igrisca ne deli.';
