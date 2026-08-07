-- Zapre razhajanje med migracijami in produkcijo, ki ga je razkril prvi
-- dejanski `db reset` na sveži bazi (7. 8. 2026).
--
-- Vseh 37 migracij se je na prazni bazi izvedlo BREZ napake — vrstni red torej
-- drži. A nastala baza NI bila enaka produkcijski. Ta datoteka zapre vseh devet
-- razhajanj; po njej sta shemi enaki v stolpcih, indeksih, funkcijah, prožilcih,
-- politikah, omejitvah in pogledih.
--
-- Vse je idempotentno; na produkciji je datoteka NO-OP.

-- ─────────────────────────────────────────────────────────────
-- 1) tournament_groups.group_size — MANJKA v migracijah (usodno)
--
--    V produkciji obstaja (integer, default 4), nastal je mimo repozitorija.
--    Nobena migracija ga ne ustvari: 00_schema.sql ima group_size samo na
--    tabeli `tournaments`, ne na `tournament_groups`.
--
--    Aplikacija ga PIŠE ob žrebu skupin (TournamentEdit.tsx, handleDraw:
--    `group_size: a.size`) in BERE povsod, kjer izbira predlogo skupine
--    3/4/5 (`g.group_size ?? 4` v TournamentEdit in Tournament.tsx).
--
--    Na sveži bazi je bilo empirično preverjeno, da žreb skupin pade z:
--      ERROR 42703: column "group_size" of relation "tournament_groups"
--      does not exist
--    Brez tega stolpca je torej obnovljena baza neuporabna za turnirje.
-- ─────────────────────────────────────────────────────────────
alter table public.tournament_groups
  add column if not exists group_size integer default 4;

comment on column public.tournament_groups.group_size is
  'Stevilo ekip v skupini (3/4/5). Doloci predlogo tekem skupine. Privzeto 4.';

-- ─────────────────────────────────────────────────────────────
-- 2) Indeksi na double_registrations — MANJKAJO v migracijah
--
--    Trije indeksi obstajajo v produkciji, a jih nobena migracija ne ustvari
--    (20260729_01_perf_fk_indexes.sql pokrije le tuje ključe primary_team_id,
--    secondary_team_id in resolved_by). Vpliv je zmogljivostni, ne funkcijski.
-- ─────────────────────────────────────────────────────────────
create index if not exists dr_player_idx on public.double_registrations (player_id);
create index if not exists dr_season_idx on public.double_registrations (season_id);
create index if not exists dr_status_idx on public.double_registrations (status);

-- ─────────────────────────────────────────────────────────────
-- 3) update_player_statistics — je v migracijah, a je produkcija NIMA
--
--    20250517_01_player_statistics_trigger.sql ustvari funkcijo in sprozilec
--    trg_update_player_statistics na `matches`. V produkciji ne obstajata
--    (odstranjena mimo repozitorija), tabela player_statistics pa ima 0 vrstic
--    — statistika se racuna drugje (engines/leagueStats.ts, lib/rangLestvica.ts).
--
--    Brez tega bi obnovljena baza ozivila sprozilec, ki bi ob vsaki koncani
--    tekmi pisal v tabelo, ki je produkcija ne uporablja. Izvirne migracije ne
--    spreminjamo (zgodovina ostane), stanje uskladi ta datoteka.
-- ─────────────────────────────────────────────────────────────
drop trigger if exists trg_update_player_statistics on public.matches;
drop function if exists public.update_player_statistics();

-- ─────────────────────────────────────────────────────────────
-- 4) league_seasons: CHECK za category je bil PREOZEK
--
--    00_schema.sql dovoli le men/women/u18. Produkcija dovoli sedem vrednosti,
--    aplikacija pa jih ponuja: LeagueAdmin.tsx obrazec za novo sezono ima
--    <option value="u18_women">, ligasko drevo pa ima mesti u14 in u18
--    (leagueTree.ts). Na obnovljeni bazi bi ustvarjanje U14 ali U18 zenske
--    sezone padlo s krsitvijo omejitve.
-- ─────────────────────────────────────────────────────────────
alter table public.league_seasons drop constraint if exists league_seasons_category_check;
alter table public.league_seasons add constraint league_seasons_category_check
  check (category = any (array['men','women','u18','u18_women','u15','u14','u12']));

-- ─────────────────────────────────────────────────────────────
-- 5) league_seasons: CHECK za tier MANJKA v migracijah
--
--    20260709_03_skupinski_sistem.sql doda stolpec `tier text` brez omejitve.
--    Produkcija ima CHECK s petimi ravnmi (vkljucno z 'obz'). Brez njega bi
--    obnovljena baza sprejela poljuben niz kot ligasko raven — tiho bi nastale
--    sezone, ki jih ligasko drevo ne zna umestiti nikamor.
-- ─────────────────────────────────────────────────────────────
alter table public.league_seasons drop constraint if exists league_seasons_tier_check;
alter table public.league_seasons add constraint league_seasons_tier_check
  check (tier = any (array['super_liga','1_liga','2_liga_zahod','2_liga_vzhod','obz']));

alter table public.league_seasons alter column tier set default 'super_liga';

-- ─────────────────────────────────────────────────────────────
-- 6) tournament_groups.group_size: CHECK (3/4/5)
--
--    Spada k stolpcu iz tocke 1 — predloge tekem obstajajo samo za 3, 4 in 5
--    ekip v skupini (engines/tournament.ts).
-- ─────────────────────────────────────────────────────────────
alter table public.tournament_groups drop constraint if exists tournament_groups_group_size_check;
alter table public.tournament_groups add constraint tournament_groups_group_size_check
  check (group_size = any (array[3,4,5]));

-- ─────────────────────────────────────────────────────────────
-- 7) double_registrations: sezona je obvezna, ekipi morata biti razlicni
--
--    02_out_of_band_schema_dopolnitev.sql je season_id zapisal kot neobvezen
--    in izpustil CHECK dr_different_teams. Produkcija ima oboje strozje.
--    Obe vpisni mesti v aplikaciji (Profile.tsx in PlayerDetail.tsx) season_id
--    vedno posljeta, zato je NOT NULL skladen z dejansko rabo.
--
--    Tuji kljuc na season_id: produkcija NIMA ON DELETE CASCADE. Poravnamo se
--    po produkciji (brisanja sezone aplikacija tako ali tako ne pozna).
-- ─────────────────────────────────────────────────────────────
update public.double_registrations dr
   set season_id = lt.season_id
  from public.league_teams lt
 where dr.season_id is null and lt.id = dr.primary_team_id;
-- Namenoma BREZ `delete ... where season_id is null`: ce zapisa ne bi bilo
-- mogoce razresiti, naj migracija pade in naj clovek pogleda, ne pa da tiho
-- pobrise vlogo za dvojno registracijo. (Na produkciji je takih vrstic 0.)
alter table public.double_registrations alter column season_id set not null;

alter table public.double_registrations drop constraint if exists dr_different_teams;
alter table public.double_registrations add constraint dr_different_teams
  check (primary_team_id <> secondary_team_id);

alter table public.double_registrations drop constraint if exists double_registrations_season_id_fkey;
alter table public.double_registrations add constraint double_registrations_season_id_fkey
  foreign key (season_id) references public.league_seasons(id);

-- ─────────────────────────────────────────────────────────────
-- 8) league_fixtures.judge_ids: privzetek '{}' in NOT NULL
--
--    20260709_03_skupinski_sistem.sql doda stolpec brez privzetka. Produkcija
--    ima `not null default '{}'::uuid[]`. Brez tega bi vsaka nova tekma dobila
--    NULL, `.contains('judge_ids', [user.id])` (Profile.tsx) pa NULL vrstic ne
--    vrne — sodnik svojih tekem ne bi videl.
-- ─────────────────────────────────────────────────────────────
alter table public.league_fixtures alter column judge_ids set default '{}'::uuid[];
update public.league_fixtures set judge_ids = '{}'::uuid[] where judge_ids is null;
alter table public.league_fixtures alter column judge_ids set not null;

-- ─────────────────────────────────────────────────────────────
-- 9) sync_user_club: manjka `set search_path = ''`
--
--    Produkcija ima funkcijo utrjeno (odziv na Supabase opozorilo
--    `function_search_path_mutable`), 20260707_01_sync_user_club.sql pa ne.
--    Obnovljena baza bi torej dobila funkcijo s spremenljivo iskalno potjo —
--    varnostni nazadek. Telo ze zdaj polno kvalificira `public.clubs`, zato
--    prazna iskalna pot nicesar ne pokvari.
--
--    (Edina preostala razlika, `set_user_role`, so prazne vrstice v telesu —
--    logika je znak za znak enaka; tega ne poravnavamo.)
-- ─────────────────────────────────────────────────────────────
create or replace function public.sync_user_club()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.club_id is not null and (new.club is null or btrim(new.club) = '') then
    select name into new.club from public.clubs where id = new.club_id;
  end if;
  return new;
end;
$$;
