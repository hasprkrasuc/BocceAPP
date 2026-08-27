-- POVRATEK za 20260827_02_klubski_skrbnik.sql
--
-- Ni del rednega zaporedja migracij. Pognati ROČNO v Supabase SQL editorju.
--
-- Odstrani vlogo klubskega skrbnika v celoti: pogled, funkcijo in tabelo z
-- vsemi dodelitvami. Kdor je bil skrbnik, to preneha biti; navadni uporabniki
-- in globalni admini ostanejo nedotaknjeni.
--
-- Vrstni red je pomemben: pogled kliče funkcijo, zato mora pasti prvi.
--
-- Po tem zaslon /admin/moj-klub javi napako, dokler ni odstranjena tudi koda
-- (src/pages/admin/MojKlub.tsx in api/club-member.ts).
--
-- Če hočeš dodelitve ohraniti, jih pred zagonom izvozi:
--   select club_id, user_id, created_at from public.club_admins;

drop view     if exists public.club_members;
drop function if exists public.is_club_admin(uuid);
drop table    if exists public.club_admins;
