-- Krožni (Berger) ligaški format za DP, ki so bila igrana vsak-z-vsakim
-- (npr. DP Igra v krog Mladinke 2026). Prikaz = lestvica po točkah (2/1/0).
ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_format_check;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_format_check
  CHECK (format = ANY (ARRAY['groups'::text, 'knockout'::text, 'round_robin'::text]));
