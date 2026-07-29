// scripts/check-rls-regression.cjs
//
// Regresijski test RLS pravic po prepisu politik (2026-07-29_perf_rls_initplan.sql).
// Preverja MATRIKO VLOG neposredno proti bazi, mimo UI — politika, ki jo obide
// surov PostgREST klic, ni politika.
//
//   vloga                    mora znati                         ne sme znati
//   anon                     brati lestvice in razpored         pisati karkoli
//   authenticated (igralec)  prijaviti sebe                     urejati tuje prijave
//   sodnik (chief_judge_id)  vpisati zapisnik SVOJE tekme       vpisati zapisnik tuje tekme
//   admin                    vse                                —
//
// Vrstica "sodnik" je najbolj kritična: politiki "Glavni sodnik piše zapisnik"
// in "Glavni sodnik piše discipline" sta tisti, ki dejansko delujeta med
// tekmovanjem.
//
// Uporablja izključno SINTETIČNE podatke in vse za sabo pobriše.
// Poženi PROTI PREVIEW/STAGING BRANCHU, ne proti produkciji.
//
//   node scripts/check-rls-regression.cjs
//
// Potrebuje scripts/.env.local: SUPABASE_URL, SERVICE_ROLE_KEY, ANON_KEY.
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

/**
 * Bere scripts/.env.local IN korenski .env.local (odjemalčev).
 *
 * Anon ključ je v obeh datotekah, a pod različnima imenoma: scripts uporablja
 * ANON_KEY, odjemalec VITE_SUPABASE_ANON_KEY. Skripta sprejme oboje, da ga ni
 * treba prepisovati sem in tja — je javen ključ, ki gre tako ali tako v bundle.
 */
function loadEnv() {
  const raw = {};
  for (const file of [path.join(__dirname, '.env.local'),
                      path.join(__dirname, '..', '.env.local')]) {
    if (!fs.existsSync(file)) continue;
    fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach(l => {
      const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !raw[m[1]]) raw[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    });
  }

  const env = {
    SUPABASE_URL:     raw.SUPABASE_URL     || raw.VITE_SUPABASE_URL,
    SERVICE_ROLE_KEY: raw.SERVICE_ROLE_KEY || raw.SUPABASE_SERVICE_ROLE_KEY,
    ANON_KEY:         raw.ANON_KEY         || raw.VITE_SUPABASE_ANON_KEY,
  };

  const missing = Object.entries(env).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    throw new Error(
      `Manjka ${missing.join(', ')}. Pričakovano v scripts/.env.local ` +
      '(SUPABASE_URL, SERVICE_ROLE_KEY, ANON_KEY) ali v korenskem .env.local ' +
      '(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).',
    );
  }
  return env;
}

const env = loadEnv();
const admin = createClient(env.SUPABASE_URL, env.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const results = [];
function check(label, ok, detail = '') {
  results.push({ label, ok });
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
}
/** Uspeh pomeni: vrnjena je vsaj ena vrstica (RLS je pisanje dovolil). */
function wrote(res) {
  return !res.error && (res.data || []).length > 0;
}

const STAMP = Date.now();
const PASSWORD = 'Test-RLS-Regresija-2026!';
const created = { users: [], season: null, teams: [], fixtures: [], results: [],
                  disciplines: [], tournament: null };

async function makeUser(tag, role) {
  const email = `test.rls.${tag}.${STAMP}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  });
  if (error) throw error;
  created.users.push(data.user.id);
  await admin.from('users').update({
    full_name: `Testni ${tag}`, role,
  }).eq('id', data.user.id);
  const client = createClient(env.SUPABASE_URL, env.ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (sErr) throw sErr;
  return { id: data.user.id, client };
}

async function cleanup() {
  await admin.from('league_match_discipline_results').delete()
    .in('match_result_id', created.results.length ? created.results : ['00000000-0000-0000-0000-000000000000']);
  for (const id of created.disciplines) await admin.from('league_season_disciplines').delete().eq('id', id);
  if (created.tournament) {
    await admin.from('tournament_registrations').delete().eq('tournament_id', created.tournament);
    await admin.from('tournaments').delete().eq('id', created.tournament);
  }
  for (const id of created.results) await admin.from('league_match_results').delete().eq('id', id);
  for (const id of created.fixtures) await admin.from('league_fixtures').delete().eq('id', id);
  for (const id of created.teams) await admin.from('league_teams').delete().eq('id', id);
  if (created.season) await admin.from('league_seasons').delete().eq('id', created.season);
  for (const id of created.users) await admin.auth.admin.deleteUser(id).catch(() => {});
}

(async () => {
  // ── Sintetični ligaški oder: sezona, dve ekipi, dve tekmi ──────────────
  const { data: season, error: seasonErr } = await admin.from('league_seasons')
    .insert({ name: `ZZ Test RLS ${STAMP}`, year: 2099, status: 'active' })
    .select().single();
  if (seasonErr) throw new Error(`Ne morem ustvariti testne sezone: ${seasonErr.message}`);
  created.season = season.id;

  const { data: teams } = await admin.from('league_teams').insert([
    { season_id: season.id, club_name: `ZZ Test A ${STAMP}`, short_name: 'ZZA' },
    { season_id: season.id, club_name: `ZZ Test B ${STAMP}`, short_name: 'ZZB' },
  ]).select();
  created.teams = (teams || []).map(t => t.id);

  const judge = await makeUser('sodnik', 'player');
  const player = await makeUser('igralec', 'player');
  const adminUser = await makeUser('admin', 'admin');

  const { data: fixtures } = await admin.from('league_fixtures').insert([
    { season_id: season.id, round_number: 1, home_team_id: created.teams[0],
      away_team_id: created.teams[1], status: 'scheduled', chief_judge_id: judge.id },
    { season_id: season.id, round_number: 2, home_team_id: created.teams[1],
      away_team_id: created.teams[0], status: 'scheduled', chief_judge_id: null },
  ]).select();
  created.fixtures = (fixtures || []).map(f => f.id);
  const [myFixture, otherFixture] = fixtures;

  const anon = createClient(env.SUPABASE_URL, env.ANON_KEY, { auth: { persistSession: false } });

  // ── anon ───────────────────────────────────────────────────────────────
  const readFixtures = await anon.from('league_fixtures').select('id').eq('season_id', season.id);
  check('anon BERE razpored', !readFixtures.error && (readFixtures.data || []).length === 2,
        readFixtures.error?.message);

  const readStandings = await anon.from('league_teams').select('id').eq('season_id', season.id);
  check('anon BERE ekipe/lestvico', !readStandings.error && (readStandings.data || []).length === 2,
        readStandings.error?.message);

  const anonWrite = await anon.from('league_fixtures')
    .update({ home_score: 99 }).eq('id', myFixture.id).select();
  check('anon NE piše po tekmah', !wrote(anonWrite));

  const anonInsert = await anon.from('league_seasons')
    .insert({ name: 'ZZ vsiljena sezona', year: 2099, status: 'active' }).select();
  check('anon NE ustvarja sezon', !!anonInsert.error);

  // ── sodnik (chief_judge_id) ────────────────────────────────────────────
  const judgeOwn = await judge.client.from('league_match_results')
    .insert({ fixture_id: myFixture.id }).select();
  check('sodnik VPIŠE zapisnik svoje tekme', wrote(judgeOwn), judgeOwn.error?.message);
  if (judgeOwn.data?.[0]) created.results.push(judgeOwn.data[0].id);

  const judgeOwnFixture = await judge.client.from('league_fixtures')
    .update({ home_score: 5, away_score: 3, status: 'completed' })
    .eq('id', myFixture.id).select();
  check('sodnik ZAKLJUČI svojo tekmo', wrote(judgeOwnFixture), judgeOwnFixture.error?.message);

  const judgeOther = await judge.client.from('league_match_results')
    .insert({ fixture_id: otherFixture.id }).select();
  check('sodnik NE vpiše zapisnika tuje tekme', !wrote(judgeOther));
  if (judgeOther.data?.[0]) created.results.push(judgeOther.data[0].id);

  const judgeOtherFixture = await judge.client.from('league_fixtures')
    .update({ home_score: 9 }).eq('id', otherFixture.id).select();
  check('sodnik NE ureja tuje tekme', !wrote(judgeOtherFixture));

  // Discipline: save() v LeagueMatchScoresheet.tsx najprej POBRIŠE obstoječe
  // discipline in jih vpiše znova. Če politika za brisanje manjka, se zapisnik
  // tiho ne shrani — natanko sredi tekmovanja. Zato se preverjata oba koraka.
  if (judgeOwn.data?.[0]) {
    const { data: disc } = await admin.from('league_season_disciplines')
      .insert({ season_id: season.id, name: 'ZZ Test disciplina', order_num: 1 })
      .select().single();

    if (disc) {
      created.disciplines.push(disc.id);
      const drIns = await judge.client.from('league_match_discipline_results')
        .insert({ match_result_id: judgeOwn.data[0].id, discipline_id: disc.id,
                  home_score: 13, away_score: 7 }).select();
      check('sodnik VPIŠE discipline svojega zapisnika', wrote(drIns), drIns.error?.message);

      const drDel = await judge.client.from('league_match_discipline_results')
        .delete().eq('match_result_id', judgeOwn.data[0].id).select();
      check('sodnik POBRIŠE discipline (pot shranjevanja zapisnika)', wrote(drDel),
            drDel.error?.message);
    } else {
      check('sodnik VPIŠE discipline svojega zapisnika', false, 'discipline ni bilo mogoce ustvariti');
    }
  }

  // ── igralec ────────────────────────────────────────────────────────────
  const playerProfile = await player.client.from('users')
    .update({ full_name: 'Testni igralec (spremenjeno)' }).eq('id', player.id).select();
  check('igralec UREJA svoj profil', wrote(playerProfile), playerProfile.error?.message);

  const playerOther = await player.client.from('users')
    .update({ full_name: 'VDOR' }).eq('id', judge.id).select();
  check('igralec NE ureja tujega profila', !wrote(playerOther));

  const playerWrite = await player.client.from('league_fixtures')
    .update({ home_score: 42 }).eq('id', myFixture.id).select();
  check('igralec NE piše po tekmah', !wrote(playerWrite));

  // ── osebni podatki (2026-07-29_users_pii_authenticated.sql) ────────────
  // Doslej je vsak prijavljen račun prebral emso, e-pošto, telefon in naslov
  // VSEH uporabnikov. To so preverbe, da je tisto okno zaprto.
  const piiDirect = await player.client.from('users').select('emso, email, phone').limit(1);
  check('igralec NE bere PII neposredno iz users', !!piiDirect.error,
        piiDirect.error ? '' : 'poizvedba je uspela');

  const piiStar = await player.client.from('users').select('*').limit(1);
  check('igralec NE bere users(*)', !!piiStar.error,
        piiStar.error ? '' : 'poizvedba je uspela');

  const piiPublic = await player.client.from('users').select('id, full_name, club').limit(1);
  check('igralec BERE javne stolpce users', !piiPublic.error, piiPublic.error?.message);

  const dobDirect = await player.client.from('users').select('date_of_birth').limit(1);
  check('igralec NE bere polnega datuma rojstva', !!dobDirect.error);

  const licDirect = await player.client.from('users').select('license_number').limit(1);
  check('igralec NE bere stevilke licence', !!licDirect.error);

  const yearPublic = await anon.from('users').select('id, birth_year').limit(1);
  check('anon BERE letnico rojstva (birth_year)', !yearPublic.error, yearPublic.error?.message);

  const dobAnon = await anon.from('users').select('date_of_birth').limit(1);
  check('anon NE bere polnega datuma rojstva', !!dobAnon.error);

  const ownView = await player.client.from('users_sensitive').select('id, phone').eq('id', player.id);
  check('igralec BERE svoj profil prek users_sensitive',
        !ownView.error && (ownView.data || []).length === 1, ownView.error?.message);

  const othersView = await player.client.from('users_sensitive').select('id').neq('id', player.id);
  check('igralec prek pogleda NE vidi tujih profilov', (othersView.data || []).length === 0);

  const anonView = await anon.from('users_sensitive').select('id').limit(1);
  check('anon NE doseže users_sensitive', !!anonView.error || (anonView.data || []).length === 0);

  const adminView = await adminUser.client.from('users_sensitive').select('id').limit(5);
  check('admin BERE profile prek users_sensitive',
        !adminView.error && (adminView.data || []).length > 0, adminView.error?.message);

  // ── admin ──────────────────────────────────────────────────────────────
  const adminSeason = await adminUser.client.from('league_seasons')
    .update({ name: `ZZ Test RLS ${STAMP} (admin)` }).eq('id', season.id).select();
  check('admin UREJA sezono', wrote(adminSeason), adminSeason.error?.message);

  const adminFixture = await adminUser.client.from('league_fixtures')
    .update({ venue: 'Testno igrišče' }).eq('id', otherFixture.id).select();
  check('admin UREJA katerokoli tekmo', wrote(adminFixture), adminFixture.error?.message);

  // Brisanje prijave na turnir: prva različica migracije je politiko
  // "Admin izbriše prijave" odstranila in je ni nadomestila, ker
  // tournament_registrations ni bila v zanki. Ta preverba to ujame.
  const { data: trn } = await admin.from('tournaments')
    .insert({ name: `ZZ Test turnir ${STAMP}`, date: '2099-01-01',
              location: 'Testno', category: 'men', status: 'registration_open' })
    .select().single();
  if (trn) {
    created.tournament = trn.id;
    const { data: reg } = await admin.from('tournament_registrations')
      .insert({ tournament_id: trn.id, player1_id: player.id }).select().single();
    if (reg) {
      const adminDelReg = await adminUser.client.from('tournament_registrations')
        .delete().eq('id', reg.id).select();
      check('admin IZBRIŠE prijavo na turnir', wrote(adminDelReg), adminDelReg.error?.message);
    } else {
      check('admin IZBRIŠE prijavo na turnir', false, 'prijave ni bilo mogoce ustvariti');
    }
  } else {
    check('admin IZBRIŠE prijavo na turnir', false, 'turnirja ni bilo mogoce ustvariti');
  }

  const adminInsert = await adminUser.client.from('league_teams')
    .insert({ season_id: season.id, club_name: `ZZ Test C ${STAMP}`, short_name: 'ZZC' }).select();
  check('admin USTVARI ekipo', wrote(adminInsert), adminInsert.error?.message);
  if (adminInsert.data?.[0]) created.teams.push(adminInsert.data[0].id);

  await Promise.all([judge, player, adminUser].map(u => u.client.auth.signOut()));
})()
  .catch(e => { console.error('\nNAPAKA:', e.message); process.exitCode = 1; })
  .finally(async () => {
    await cleanup();
    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} preverb uspesnih`);
    if (failed.length) {
      console.error('PRAVICE SO SE POSLABSALE — ne objavljaj migracije.');
      process.exitCode = 1;
    }
  });
