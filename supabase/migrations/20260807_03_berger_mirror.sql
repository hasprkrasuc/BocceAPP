-- Zrcaljenje Bergerjeve tabele (dom/gost).
--
-- Priloga B (BZS) doloca, da v 1. krogu igra doma ekipa z NIZJO zrebano
-- stevilko. OBZ Nova Gorica razpored objavlja v obrnjenem zapisu -- doma
-- igra ekipa z VISJO stevilko.
--
-- To ni stvar zreba: za dani nabor parov in kol obstaja natanko ena dodelitev
-- zrebanih stevilk, in pri njej je stran obrnjena pri vseh 45 tekmah. Brez
-- tega stikala bi bila vsaka tekma razpisana pri napacnem klubu.
--
-- Pari in kola ostanejo enaki; spremeni se samo, kdo je doma. Razdelitveni
-- drugi del se prilagodi sam, ker stran bere iz dejanskih tekem prvega dela.
--
-- Privzeto false -- obstojece sezone se ne premaknejo.

alter table public.league_seasons
  add column if not exists berger_mirror boolean not null default false;

comment on column public.league_seasons.berger_mirror is
  'true = dom/gost obrnjen glede na Bergerjevo tabelo (Priloga B); v 1. krogu igra doma ekipa z visjo zrebano stevilko. Uporablja OBZ Nova Gorica.';
