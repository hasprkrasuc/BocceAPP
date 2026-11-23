-- Pogleda users_sensitive in club_members sta SECURITY DEFINER: tečeta s
-- pravicami lastnika (postgres). Ker users nima FORCE ROW LEVEL SECURITY,
-- lastnik RLS ne čuti — pisanje skozi ta pogleda torej RLS tabele users
-- POPOLNOMA ZAOBIDE.
--
-- Za BRANJE je to namenoma tako in mora ostati: vlogi anon in authenticated
-- na public.users nimata stolpčne pravice za emso, naslov, e-pošto, telefon
-- in datum rojstva, zato je definer edini način, da lastnik vidi svoje
-- podatke. Varovalo je v telesu pogleda (id = auth.uid() or is_admin()).
-- Prestavitev na security_invoker bi funkcijo podrla, ne popravila.
--
-- Težava so PISALNE pravice, ki ju nihče ni hotel. Privzete pravice sheme
-- public (pg_default_acl) vsakemu novemu razmerju podelijo arwdDxtm vlogama
-- anon in authenticated, kar pri tabeli ni sporno, ker filtrira RLS — pri
-- definer pogledu pa RLS odpade. Posledice:
--
--   * users_sensitive: authenticated je imel INSERT/UPDATE/DELETE. Prožilec
--     trg_prevent_role_escalation je BEFORE UPDATE, ne BEFORE INSERT, pogled
--     pa nima WITH CHECK OPTION. Zaporedje DELETE + INSERT nad lastno vrstico
--     zato ni bilo zaprto, čeprav je UPDATE vloge bil.
--   * club_members: isto, le da je pravice imela tudi vloga anon.
--
-- Aplikacija oba pogleda uporablja izključno za branje (AuthContext, Profile,
-- UserAdmin, PlayerImport, MojKlub), zato odvzem pisanja ničesar ne podre.
--
-- anon na club_members ne izgubi vidnega: telo pogleda zahteva is_admin() ali
-- is_club_admin(), kar je za neprijavljenega vedno neresnično.
--
-- service_role se ne dotikamo — teče na strežniku in RLS ga tako ali tako ne
-- omejuje.

revoke all on public.users_sensitive from anon, authenticated;
revoke all on public.club_members   from anon, authenticated;

grant select on public.users_sensitive to authenticated;
grant select on public.club_members   to authenticated;

-- Idempotentno: ponovni zagon je no-op, ker revoke in grant nista kumulativna.
