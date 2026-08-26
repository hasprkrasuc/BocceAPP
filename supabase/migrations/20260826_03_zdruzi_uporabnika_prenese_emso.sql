-- Združitev dveh zapisov iste osebe — POPRAVEK 20260826_02.
--
-- Zamenja celotno funkcijo (create or replace). Razlika proti 20260826_02 je
-- ena sama in je opisana pri »Prenos unikatnih vrednosti« na koncu telesa:
-- EMŠO in licenca se z opuščenega zapisa PRESTAVITA na obdržanega znotraj iste
-- transakcije, namesto da bi ju funkcija samo pobrisala in prepis prepustila
-- aplikaciji.
--
-- Napako je odkrila preverba s sintetičnimi zapisi 26. 8. 2026, testi je niso
-- mogli: gre za vedenje v bazi, ne za pravilo v kodi.
--
-- Ta datoteka je namenoma polna kopija funkcije in ne le popravek — telo je
-- treba brati kot celoto, sicer se ob naslednji spremembi ne ve, kaj velja.
--
-- ═══════════════════════════════════════════════════════════════════════
--
-- Prestavitev vseh sklicev.
--
-- Uvoz igralcev zna ustvariti drugi zapis za človeka, ki v bazi že je: kadar v
-- evidenci nima ne e-naslova ne EMŠO ne datuma rojstva, ga nima po čem ujeti.
-- Tako so nastali Mohinski, Vehovec, Šumi in Brus. Doslej smo jih združevali
-- ročno v SQL, kar je počasno in nevarno — spregledan sklic ostane visel.
--
-- ZAKAJ FUNKCIJA IN NE ZAPOREDJE KLICEV IZ APLIKACIJE
--
-- Uporabnik stoji na 14 mestih. Prek PostgREST bi bilo to 14 ločenih zahtev,
-- vsaka svoja transakcija — če pade sedma, ostane oseba na pol prestavljena in
-- baza v stanju, ki ga ni znal predvideti nihče. Tu je vse v eni transakciji:
-- ali se prestavi vse ali nič.
--
-- KAJ FUNKCIJA NAMENOMA ZAVRNE
--
-- Dvoje ustavi z napako, namesto da bi ugibala:
--
--   1) Zapisa sta skupaj prijavljena na turnir (eden kot player1, drugi kot
--      player2). Po združitvi bi bila oseba v paru sama s seboj. To je tudi
--      močan znak, da gre v resnici za dva človeka.
--   2) Zapisa nastopata v isti postavi zapisnika. Tiho brisanje enega bi
--      spremenilo zapisan rezultat tekme, česar ne sme narediti nihče mimogrede.
--
-- Kjer trk pomeni le podvojeno vrstico brez izgube pomena (ista ekipa, isti
-- sodniški seznam, ista sezona), vrstico opuščenega odstrani in to poroča.
--
-- PRAVICE: security definer, ker posega po tabelah, do katerih klicatelj prek
-- RLS nima dostopa. Zato je izvajanje odvzeto vsem razen service_role — kliče
-- jo samo api/user-merge.ts, ki klicatelja prej preveri. Brez tega odvzema bi
-- jo lahko poklical katerikoli prijavljen uporabnik.
--
-- Funkcija NE briše prijavnega računa (auth.users) — to opravi api/user-merge.ts
-- po uspešnem klicu. Vrstni red je namenoma tak: če bi bris uspel, prestavitev
-- pa ne, bi bili podatki izgubljeni. Obratno ostane le odvečen prazen zapis, ki
-- ga je mogoče pobrisati pozneje.
--
-- Od preostalih podatkov na obdržani zapis prenese SAMO EMŠO in licenco, ker sta
-- to edini polji pod unikatom in ju mora zato tako ali tako vzeti v roke. Ime,
-- datum rojstva, spol, klub in fotografijo prepiše api/user-merge.ts po pravilih
-- iz src/engines/zdruzitevUporabnikov.ts — tam so testirana in na enem mestu.

create or replace function public.zdruzi_uporabnika(obdrzi uuid, opusti uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p jsonb := '{}'::jsonb;
  n integer;
  v_emso text;
  v_licenca text;
  v_emso_prazen boolean;
  v_licenca_prazna boolean;
begin
  if obdrzi is null or opusti is null then
    raise exception 'Manjka id obdržanega ali opuščenega zapisa';
  end if;
  if obdrzi = opusti then
    raise exception 'Obdržani in opuščeni zapis sta ista vrstica';
  end if;
  if not exists (select 1 from public.users where id = obdrzi) then
    raise exception 'Obdržanega zapisa ni v bazi';
  end if;
  if not exists (select 1 from public.users where id = opusti) then
    raise exception 'Opuščenega zapisa ni v bazi';
  end if;

  -- ── Zavrnitvi ─────────────────────────────────────────────
  select count(*) into n
    from public.tournament_registrations
   where (player1_id = obdrzi and player2_id = opusti)
      or (player1_id = opusti and player2_id = obdrzi);
  if n > 0 then
    raise exception
      'Zapisa sta skupaj prijavljena na % turnirjih — po združitvi bi bila oseba v paru sama s seboj. Najprej popravi prijave.', n;
  end if;

  select count(*) into n
    from public.league_match_discipline_results
   where (jsonb_typeof(home_players) = 'array'
          and home_players ? obdrzi::text and home_players ? opusti::text)
      or (jsonb_typeof(away_players) = 'array'
          and away_players ? obdrzi::text and away_players ? opusti::text);
  if n > 0 then
    raise exception
      'Zapisa nastopata skupaj v % postavah zapisnikov — združitev bi istega igralca postavila dvakrat. Zapisnike popravi ročno.', n;
  end if;

  -- ── Trki ob unikatih: vrstico opuščenega odstrani ─────────
  -- league_team_players_team_player_uniq (league_team_id, player_id)
  delete from public.league_team_players d
   where d.player_id = opusti
     and exists (select 1 from public.league_team_players k
                  where k.league_team_id = d.league_team_id and k.player_id = obdrzi);
  get diagnostics n = row_count;
  p := p || jsonb_build_object('odstranjena_podvojena_clanstva', n);

  -- player_statistics_player_id_year_key (player_id, year)
  -- Statistika je izpeljana vrednost; po združitvi jo je treba preračunati.
  delete from public.player_statistics d
   where d.player_id = opusti
     and exists (select 1 from public.player_statistics k
                  where k.year = d.year and k.player_id = obdrzi);
  get diagnostics n = row_count;
  p := p || jsonb_build_object('odstranjene_podvojene_statistike', n);

  -- league_season_admins_pkey (season_id, user_id)
  delete from public.league_season_admins d
   where d.user_id = opusti
     and exists (select 1 from public.league_season_admins k
                  where k.season_id = d.season_id and k.user_id = obdrzi);
  get diagnostics n = row_count;
  p := p || jsonb_build_object('odstranjene_podvojene_admin_vloge', n);

  -- ── Prestavitev: stolpci s tujim ključem ──────────────────
  update public.league_team_players set player_id = obdrzi where player_id = opusti;
  get diagnostics n = row_count; p := p || jsonb_build_object('league_team_players.player_id', n);

  update public.player_statistics set player_id = obdrzi where player_id = opusti;
  get diagnostics n = row_count; p := p || jsonb_build_object('player_statistics.player_id', n);

  update public.double_registrations set player_id = obdrzi where player_id = opusti;
  get diagnostics n = row_count; p := p || jsonb_build_object('double_registrations.player_id', n);

  update public.double_registrations set resolved_by = obdrzi where resolved_by = opusti;
  get diagnostics n = row_count; p := p || jsonb_build_object('double_registrations.resolved_by', n);

  update public.tournament_registrations set player1_id = obdrzi where player1_id = opusti;
  get diagnostics n = row_count; p := p || jsonb_build_object('tournament_registrations.player1_id', n);

  update public.tournament_registrations set player2_id = obdrzi where player2_id = opusti;
  get diagnostics n = row_count; p := p || jsonb_build_object('tournament_registrations.player2_id', n);

  update public.league_teams set captain_id = obdrzi where captain_id = opusti;
  get diagnostics n = row_count; p := p || jsonb_build_object('league_teams.captain_id', n);

  update public.league_fixtures set chief_judge_id = obdrzi where chief_judge_id = opusti;
  get diagnostics n = row_count; p := p || jsonb_build_object('league_fixtures.chief_judge_id', n);

  update public.matches set judge_id = obdrzi where judge_id = opusti;
  get diagnostics n = row_count; p := p || jsonb_build_object('matches.judge_id', n);

  update public.tournament_groups set judge_id = obdrzi where judge_id = opusti;
  get diagnostics n = row_count; p := p || jsonb_build_object('tournament_groups.judge_id', n);

  update public.league_season_admins set user_id = obdrzi where user_id = opusti;
  get diagnostics n = row_count; p := p || jsonb_build_object('league_season_admins.user_id', n);

  -- ── Prestavitev: stolpci BREZ tujega ključa ───────────────
  -- Sodniški seznam je množica: kjer sta oba, opuščenega le odstranimo.
  update public.league_fixtures
     set judge_ids = array_remove(judge_ids, opusti)
   where opusti = any(judge_ids) and obdrzi = any(judge_ids);
  get diagnostics n = row_count; p := p || jsonb_build_object('judge_ids_odstranjen_podvojeni', n);

  update public.league_fixtures
     set judge_ids = array_replace(judge_ids, opusti, obdrzi)
   where opusti = any(judge_ids);
  get diagnostics n = row_count; p := p || jsonb_build_object('league_fixtures.judge_ids', n);

  -- Postave v zapisnikih: vrstni red nosi pomen (kdo igra na katerem mestu),
  -- zato zamenjamo na mestu z `with ordinality` in ne prek jsonb_agg(distinct).
  update public.league_match_discipline_results
     set home_players = (
       select coalesce(jsonb_agg(e order by ord), '[]'::jsonb)
         from (select case when v = opusti::text then obdrzi::text else v end as e, ord
                 from jsonb_array_elements_text(home_players) with ordinality t(v, ord)) s
     )
   where jsonb_typeof(home_players) = 'array' and home_players ? opusti::text;
  get diagnostics n = row_count; p := p || jsonb_build_object('league_match_discipline_results.home_players', n);

  update public.league_match_discipline_results
     set away_players = (
       select coalesce(jsonb_agg(e order by ord), '[]'::jsonb)
         from (select case when v = opusti::text then obdrzi::text else v end as e, ord
                 from jsonb_array_elements_text(away_players) with ordinality t(v, ord)) s
     )
   where jsonb_typeof(away_players) = 'array' and away_players ? opusti::text;
  get diagnostics n = row_count; p := p || jsonb_build_object('league_match_discipline_results.away_players', n);

  -- ── Prenos unikatnih vrednosti na obdržani zapis ──────────
  -- users_emso_uniq je delni unikat: dokler EMŠO stoji na opuščenem zapisu, ga
  -- ni mogoče zapisati na obdržanega. Zato ga najprej vzamemo v spremenljivko,
  -- opuščenega izpraznimo in šele nato zapišemo na obdržanega — vse v ISTI
  -- transakciji.
  --
  -- Prejšnja različica je vrednosti samo pobrisala in prepis prepustila
  -- aplikaciji. To je odprlo okno za izgubo: če bi prepis spodletel, bi bila
  -- EMŠO in licenca pobrisana z opuščenega in nikoli zapisana na obdržanega.
  -- Vrstni red prestavi -> prepiši -> pobriši je ščitil vse razen prav teh dveh
  -- polj, ki ju funkcija sama izprazni. Najdeno ob preverbi 26. 8. 2026.
  --
  -- coalesce: vrednost obdržanega ima prednost. Nasprotujoča si EMŠO opozori
  -- vmesnik pred združitvijo; tu se obstoječa NE povozi.
  select emso, license_number into v_emso, v_licenca
    from public.users where id = opusti;
  select emso is null, license_number is null into v_emso_prazen, v_licenca_prazna
    from public.users where id = obdrzi;

  update public.users set emso = null, license_number = null where id = opusti;

  update public.users
     set emso           = coalesce(emso, v_emso),
         license_number = coalesce(license_number, v_licenca)
   where id = obdrzi;

  -- Zastavici povesta, ali je do prevzema RES prišlo — ne le, ali je opuščeni
  -- vrednost imel. Kadar jo ima tudi obdržani, coalesce obdrži njegovo in
  -- prevzema ni.
  p := p || jsonb_build_object(
    'prevzet_emso',     (v_emso is not null and v_emso_prazen),
    'prevzeta_licenca', (v_licenca is not null and v_licenca_prazna));

  return p;
end
$$;

comment on function public.zdruzi_uporabnika(uuid, uuid) is
  'Prestavi vse sklice z opuščenega zapisa na obdržanega. Ne briše računa in ne prepisuje podatkov — to opravi api/user-merge.ts.';

-- Samo strežnik. Klicatelja preveri api/user-merge.ts; brez tega odvzema bi
-- funkcijo lahko poklical katerikoli prijavljen uporabnik in izbrisal tujo
-- statistiko ali si prisvojil tuje zapisnike.
revoke execute on function public.zdruzi_uporabnika(uuid, uuid) from public;
revoke execute on function public.zdruzi_uporabnika(uuid, uuid) from anon;
revoke execute on function public.zdruzi_uporabnika(uuid, uuid) from authenticated;
grant  execute on function public.zdruzi_uporabnika(uuid, uuid) to service_role;
