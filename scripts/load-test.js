// scripts/load-test.js — obremenitveni test za tekmovalni dan.
//
// Simulira realen scenarij: 150 gledalcev osvežuje lestvico in razpored,
// medtem ko sodniki vpisujejo rezultate.
//
//   k6 run scripts/load-test.js
//
// Okoljske spremenljivke:
//   SUPABASE_URL       npr. https://<projekt>.supabase.co
//   SUPABASE_ANON_KEY  anon ključ
//   SEASON_ID          uuid testne sezone
//
// ⚠️ Poženi PROTI PREVIEW/STAGING BRANCHU, nikoli proti produkciji in nikoli
// v tednu tekmovanja.
//
// Merilo uspeha: p95 < 800 ms pri 150 VU, stopnja napak < 1 %.
import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE = `${__ENV.SUPABASE_URL}/rest/v1`
const ANON = __ENV.SUPABASE_ANON_KEY
const SEASON = __ENV.SEASON_ID

export const options = {
  scenarios: {
    gledalci: { executor: 'constant-vus', vus: 150, duration: '3m' },
  },
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.01'],
  },
}

export function setup() {
  if (!BASE || !ANON || !SEASON) {
    throw new Error('Manjka SUPABASE_URL, SUPABASE_ANON_KEY ali SEASON_ID')
  }
}

export default function () {
  const params = { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } }

  // 1) Razpored z ekipama — poizvedba, ki jo dela League.tsx
  const fixtures = http.get(
    `${BASE}/league_fixtures?season_id=eq.${SEASON}` +
    '&select=*,home_team:league_teams!league_fixtures_home_team_id_fkey(*),' +
    'away_team:league_teams!league_fixtures_away_team_id_fkey(*)' +
    '&order=round_number',
    params,
  )
  check(fixtures, { 'razpored 200': r => r.status === 200 })

  // 2) Zapisniki z disciplinami — ugnezdena poizvedba, ki je pred indeksom
  //    idx_lmdr_match_result_id delala sekvenčno branje 17k vrstic.
  const ids = (fixtures.json() || []).map(f => f.id).slice(0, 20)
  if (ids.length) {
    const res = http.get(
      `${BASE}/league_match_results?fixture_id=in.(${ids.join(',')})` +
      '&select=*,discipline_results:league_match_discipline_results(*)',
      params,
    )
    check(res, { 'zapisniki 200': r => r.status === 200 })
  }

  sleep(3)
}
