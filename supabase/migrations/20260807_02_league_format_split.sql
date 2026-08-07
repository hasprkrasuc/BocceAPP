-- Razdelitveni ligaski sistem (OBZ Nova Gorica): tretja vrednost za
-- league_seasons.format.
--
-- 10 klubov odigra enokrozno = 9 kol. Nato se liga po lestvici razdeli na
-- skupini '1-5' in '6-10', kjer vsaka odigra se 5 kol (pet ekip, ena vsako
-- kolo pocica). Tocke iz prvih 9 kol se PRENESEJO v skupino.
--
-- Dom/gost se v fazi 2 obrne: kdor je v fazi 1 igral doma, igra zdaj v
-- gosteh. To je izvedljivo, ker se je v enokroznem delu vsak par sresal
-- natanko enkrat.
--
-- V bazi ni nic novega razen te vrednosti: kola faze 2 se stejejo naprej
-- (10-14), skupini pa se zapisita v ze obstojeci league_fixtures.group_label,
-- enako kot '1-6' in '7-12' pri 12-ekipnem sistemu.
--
-- Idempotentno; na produkciji doda le tretjo dovoljeno vrednost.

alter table public.league_seasons drop constraint if exists league_seasons_format_check;
alter table public.league_seasons add constraint league_seasons_format_check
  check (format = any (array['flat','groups','split']));

comment on column public.league_seasons.format is
  'flat = raven round robin; groups = 2x6 + nadaljevalni skupini (12 ekip); '
  'split = 10 ekip 9 kol, nato skupini 1-5 in 6-10 se po 5 kol (tocke se prenesejo).';
