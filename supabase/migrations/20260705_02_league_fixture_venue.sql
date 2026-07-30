-- Kraj tekme (balinišče) za ligaške tekme. Prikaz v pasici tekme + urejanje v zapisniku.
ALTER TABLE public.league_fixtures ADD COLUMN IF NOT EXISTS venue text;
COMMENT ON COLUMN public.league_fixtures.venue IS 'Kraj tekme (balinisce). Prikaz v pasici tekme.';
