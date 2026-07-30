-- Dovoli kategorijo 'u14' za turnirje/DP (npr. DP Dvojice U14).
-- Rang lestvica že pozna U14 (toRangCategory), constraint pa je manjkal.
ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_category_check;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_category_check
  CHECK (category = ANY (ARRAY['men','women','u18','mixed','u18_women','u15','u12','u14']));
