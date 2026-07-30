-- users.emso: en EMŠO = ena oseba.
--
-- Ta indeks doslej ni bil mogoč, ker je bilo v bazi 8 podvojenih EMŠO (posledica
-- zgodovinskih uvozov lig — ista oseba je bila ustvarjena dvakrat, ligaška pot pa
-- razcepljena med zapisoma). 9.7.2026 so bili razrešeni:
--   • 6 pravih dvojnikov združenih (reference prenesene, odvečni zapisi izbrisani)
--   • 2 primera NISTA bila dvojnika, ampak dve osebi s podvojenim EMŠO
--     (eden je imel tujega) → tujemu EMŠO počiščen
-- Preverjeno pred to migracijo: 0 podvojenih EMŠO (907 od 1172 uporabnikov ga ima).
--
-- Zakaj je to pomembno: uvoz igralcev (api/import-players.ts) ujema osebe po EMŠO.
-- Brez tega indeksa lahko dvojnik nastane znova in poizvedba .eq('emso',…).maybeSingle()
-- vrne napako (406), zaradi česar igralec pristane v `skipped`.
--
-- Delni indeks (where emso is not null): igralci brez EMŠO so dovoljeni in jih je 265.
create unique index if not exists users_emso_uniq
  on public.users (emso)
  where emso is not null;
