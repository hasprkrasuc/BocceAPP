-- POVRATEK za 20260826_02_zdruzi_uporabnika.sql
--
-- Ni del rednega zaporedja migracij. Pognati ROČNO v Supabase SQL editorju.
--
-- Odstrani funkcijo. Že opravljenih združitev NE razveljavi — prestavljenih
-- sklicev ni mogoče vrniti nazaj, ker se ne beleži, od kod so prišli.
--
-- Po tem gumb »Združi z drugim zapisom« v Upravljanju uporabnikov neha delati
-- (api/user-merge.ts vrne napako o neznani funkciji). Aplikacija sicer deluje
-- normalno — združevanje je edino, kar odpade.

drop function if exists public.zdruzi_uporabnika(uuid, uuid);
