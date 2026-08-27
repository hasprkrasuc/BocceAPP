-- POVRATEK za 20260827_01_preverjeni_dvojniki.sql
--
-- Ni del rednega zaporedja migracij. Pognati ROČNO v Supabase SQL editorju.
--
-- Odstrani tabelo in z njo VSE oznake »ni dvojnik«. Ti pari se bodo na plošči
-- možnih dvojnikov spet prikazali, kar ni napaka — le hrup, ki ga je nekdo že
-- enkrat pregledal.
--
-- Aplikacija po tem javi napako pri branju plošče, dokler ni odstranjena tudi
-- koda, ki tabelo bere (src/pages/admin/UserAdmin.tsx).
--
-- Če hočeš oznake ohraniti, jih pred zagonom izvozi:
--   select id_a, id_b, oznacil, opomba, created_at from public.preverjeni_dvojniki;

drop table if exists public.preverjeni_dvojniki;
