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

function loadEnv() {
  const env = {};
  fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8')
    .split(/\r?\n/).forEach(l => {
      const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    });
  for (const k of ['SUPABASE_URL', 'SERVICE_ROLE_KEY', 'ANON_KEY']) {
    if (!env[k]) throw new Error(`Manjka ${k} v scripts/.env.local`);
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
const created = { users: [], season: null, teams: [], fixtures: [], results: [] };

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

  // ── vloge (2026-07-29_set_user_role.sql) ───────────────────────────────
  // Neposreden update tuje vrstice ujame nič vrstic in TIHO ne naredi nič —
  // zato gre menjava vloge prek set_user_role.
  const roleDirect = await adminUser.client.from('users')
    .update({ role: 'judge' }).eq('id', player.id);
  const { data: afterDirect } = await admin.from('users').select('role').eq('id', player.id).single();
  check('neposreden update tuje vloge NE deluje (zato RPC)',
        afterDirect.role !== 'judge', roleDirect.error?.message);

  const roleRpc = await adminUser.client.rpc('set_user_role',
    { target_id: player.id, new_role: 'judge' });
  const { data: afterRpc } = await admin.from('users').select('role').eq('id', player.id).single();
  check('admin SPREMENI tujo vlogo prek set_user_role',
        !roleRpc.error && afterRpc.role === 'judge', roleRpc.error?.message);

  const roleByPlayer = await player.client.rpc('set_user_role',
    { target_id: judge.id, new_role: 'admin' });
  const { data: afterByPlayer } = await admin.from('users').select('role').eq('id', judge.id).single();
  check('igralec NE more spreminjati vlog',
        !!roleByPlayer.error && afterByPlayer.role !== 'admin');

  const roleSuper = await adminUser.client.rpc('set_user_role',
    { target_id: player.id, new_role: 'super_admin' });
  const { data: afterSuper } = await admin.from('users').select('role').eq('id', player.id).single();
  check('admin NE more podeliti super_admin',
        !!roleSuper.error && afterSuper.role !== 'super_admin');

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
