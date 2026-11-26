-- Povratek 20261123_01: pogledoma vrne pravice, kakršne sta imela prej
-- (podelile so jih privzete pravice sheme public, ne kakšna namerna odločitev).
--
-- POZOR: s tem se znova odpre pisanje skozi SECURITY DEFINER pogleda, ki
-- zaobide RLS tabele users. Poženi le, če se izkaže, da je odvzem kaj podrl,
-- in čim prej zapri drugače.

grant all on public.users_sensitive to authenticated;
grant all on public.club_members   to anon, authenticated;
