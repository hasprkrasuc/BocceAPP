-- SUPER POKAL — ena tekma na leto.
--
-- PRAVILO (BZS): igrata aktualni POKALNI PRVAK in aktualni PRVAK SUPER LIGE.
-- Če je to ista ekipa, njeno mesto prevzame POKALNI PODPRVAK. Tekma se VEDNO
-- igra pri pokalnem prvaku.
--
-- Super Pokal 2026 je prav ta izjema: QAP Postojna je osvojila Pokal BZS
-- 2025/26 (final_rank 1) in Super ligo 2025/26 (28 točk), zato igra proti
-- pokalnemu podprvaku Skala Sežana, doma.
--
-- ZAKAJ SVOJ FORMAT IN NE format='pokal'
--
-- Kot pokalna sezona bi Super Pokal deloval na pogled — pajek z dvema
-- ekipama je natanko ena tekma — a bi tiho prinesel troje napačnega:
--
--   1. RANG. Pokalne sezone v rang lestvico ŠTEJEJO s koeficientom 1,0
--      (LIGA_KOEF.pokal). Ena sama tekma bi igralcem dala ligaški rang in
--      povrhu pokalne uvrstitvene točke (8 zmagovalcu, 5 poražencu), kar
--      lestvico popači bolj, kot je tekma vredna.
--   2. DOMAČIN. V pokalu gosti NIŽJE rangirana ekipa. Tu je pravilo
--      nasprotno in močnejše: domačin je pokalni prvak, pa naj bo nasprotnik
--      iz katerekoli lige.
--   3. BESEDILO. »N prijavljenih ekip · izločilni sistem s 2 mesti · 0
--      prostih mest« ne opiše tekmovanja, v katerem se ekipi ne prijavita,
--      ampak uvrstita.
--
-- Ločiti ju je mogoče samo po formatu: po številu ekip ne, ker ima tudi
-- navaden pokal med vnašanjem nekaj časa dve ekipi, in po statusu ne, ker je
-- `status='completed'` stikalo za uvrstitvene točke — pravilo tekmovanja bi
-- tako viselo na tem, da sezone nihče ne zaključi.
--
-- KAJ SUPER POKAL NI
--
-- Ni liga: `tier` ostane NULL in sezona se ne pojavi na /liga. Spodnja
-- omejitev to zaklene, ker `updateSeasonFormat` v adminu spremeni samo
-- `format` in bi pot »naredi ligo, nato preklopi« `tier` pustila vpisan.
--
-- Ni žreb: `draw_number` tu ni žrebana številka, ampak VLOGA —
--   1 = pokalni prvak in domačin,
--   2 = nasprotnik (prvak Super lige ali pokalni podprvak).
-- Vlogi vpiše človek. Aplikacija ju ne izpelje sama, ker »aktualne« sezone ne
-- zna zanesljivo prepoznati: prvak lige je brez končnice znan že sredi
-- sezone, izenačenje `calculateStandings` tiho razreši po abecedi kluba,
-- `final_rank` pokala pa nima vnosnega zaslona. Pravilo o paru je kljub temu
-- zapisano v kodi s testi (`src/engines/superPokal.ts`), da ga je naslednje
-- leto kje prebrati.

alter table public.league_seasons
  drop constraint if exists league_seasons_format_check;
alter table public.league_seasons
  add constraint league_seasons_format_check
  check (format = any (array['flat'::text, 'groups'::text, 'split'::text,
                             'pokal'::text, 'turnir'::text, 'super_pokal'::text]));

comment on column public.league_seasons.format is
  'flat/groups/split = lige z lestvico; pokal = izločilni pajek; turnir = ekipni turnir reprezentanc; super_pokal = ena tekma med pokalnim prvakom in prvakom Super lige.';

-- Super Pokal nima ravni. Brez tega bi ga pot »liga -> preklop formata«
-- pustila s `tier`, s čimer bi pristal v izračunih, ki ravni berejo.
alter table public.league_seasons
  drop constraint if exists league_seasons_super_pokal_brez_ranga;
alter table public.league_seasons
  add constraint league_seasons_super_pokal_brez_ranga
  check (format <> 'super_pokal' or tier is null);
