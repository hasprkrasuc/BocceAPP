-- DP točkovanje po končni uvrstitvi: eksplicitni final_rank na registraciji.
-- Vir za rang DP točke (16/10/8/7/3/1 po uvrstitvi), enotno za posamezno/dvojice/
-- igro v krog/krožni sistem, vključno z mesti 5+ iz skupin. NULL = ni uvrščeno.
ALTER TABLE public.tournament_registrations
  ADD COLUMN IF NOT EXISTS final_rank integer;

COMMENT ON COLUMN public.tournament_registrations.final_rank IS
  'Koncna uvrstitev na DP (1 = prvak). Vir za rang DP tocke. NULL = ni uvrsceno/ni DP.';
