-- Nosilni žreb skupin na državnih prvenstvih se opravi po rang lestvici (bobni).
-- Nosilno vrednost ekipe (za dvojice vsota rang točk obeh igralcev) sicer
-- izračunamo iz rang lestvice, a tuji/neuvrščeni igralci na njej niso — njihov
-- rang določi admin tekmovanja. Ta stolpec hrani ROČNO nosilno vrednost ekipe:
-- če je nastavljen, prepiše izračun; NULL = uporabi rang lestvico.
ALTER TABLE public.tournament_registrations
  ADD COLUMN IF NOT EXISTS seed_points numeric;

COMMENT ON COLUMN public.tournament_registrations.seed_points IS
  'Rocna nosilna vrednost ekipe za zreb skupin (DP). Prepise izracun iz rang lestvice; NULL = izracunaj iz rang tock igralcev. Za tuje/neuvrscene igralce jo doloci admin.';
