/**
 * BOCCE LEAGUE ENGINE
 * Izračun lestvic za ekipna tekmovanja.
 *
 * URADNO PRAVILO UVRSTITVE (velja za vse lestvice):
 *   1. točke — zmaga 2, remi 1, poraz 0 (seštevek končnih izidov tekem)
 *   2. medsebojni dvoboji             — seštevek match točk v tekmah med izenačenimi ekipami
 *   3. razlika točk posameznih iger   — boule/disciplinski score razlika v medsebojnih dvobojih
 *   4. razlika v vseh igrah           — skupna boule razlika (vse tekme)
 *   (nato po imenu kluba, deterministično)
 *
 * Kriteriji 2–4 pridejo v poštev LE ob enakem številu točk (kriterij 1).
 */

import type {
  LeagueTeam, LeagueFixture, LeagueSeason, TeamStats,
  LeagueMatchResult, LeagueMatchDisciplineResult,
} from '../types'

/** Match-result z naloženimi disciplinskimi rezultati (za boule točke). */
type MatchResultWithDisc = LeagueMatchResult & { discipline_results?: LeagueMatchDisciplineResult[] }

/** fixtureId → seštevek boule (disciplinskih) točk domačih/gostov. */
export function bouleByFixture(
  matchResults?: MatchResultWithDisc[],
): Record<string, { home: number; away: number }> {
  const m: Record<string, { home: number; away: number }> = {}
  for (const mr of matchResults ?? []) {
    let h = 0, a = 0
    for (const dr of (mr.discipline_results ?? [])) {
      h += dr.home_score ?? 0
      a += dr.away_score ?? 0
    }
    m[mr.fixture_id] = { home: h, away: a }
  }
  return m
}

/** Prazen TeamStats za ekipo. */
function emptyStats(team: LeagueTeam): TeamStats {
  return {
    team, played: 0, won: 0, drawn: 0, lost: 0,
    pointsFor: 0, pointsAgainst: 0, difference: 0, points: 0,
    boulesFor: 0, boulesAgainst: 0, bouleDiff: 0,
  }
}

/** Vštej eno odigrano tekmo v statistiki obeh ekip. */
function accumulate(
  h: TeamStats, a: TeamStats, hs: number, as_: number,
  boule: { home: number; away: number } | undefined,
): void {
  h.played++; a.played++
  h.pointsFor += hs;  h.pointsAgainst += as_
  a.pointsFor += as_; a.pointsAgainst += hs
  if (hs > as_) { h.won++; a.lost++ }
  else if (as_ > hs) { a.won++; h.lost++ }
  else { h.drawn++; a.drawn++ }
  const bh = boule?.home ?? 0, ba = boule?.away ?? 0
  h.boulesFor += bh; h.boulesAgainst += ba
  a.boulesFor += ba; a.boulesAgainst += bh
}

/**
 * Razvrsti TeamStats po uradnem pravilu. Za izenačene (enak pointsFor) uporabi
 * mini-ligo medsebojnih dvobojev (kriterij 2 & 3), nato skupno boule razliko (4).
 */
function sortStandings(
  statsArr: TeamStats[],
  fixtures: LeagueFixture[],
  boule: Record<string, { home: number; away: number }>,
): TeamStats[] {
  for (const s of statsArr) { s.difference = s.pointsFor - s.pointsAgainst; s.bouleDiff = s.boulesFor - s.boulesAgainst }

  // primarno: točke (zmaga 2 / remi 1 / poraz 0), padajoče
  const arr = [...statsArr].sort((a, b) => b.points - a.points)

  // mini-liga znotraj skupin z enakim številom točk
  const out: TeamStats[] = []
  let i = 0
  while (i < arr.length) {
    let j = i + 1
    while (j < arr.length && arr[j].points === arr[i].points) j++
    const group = arr.slice(i, j)
    if (group.length > 1) rankTiedGroup(group, fixtures, boule)
    out.push(...group)
    i = j
  }
  return out
}

/** Razvrsti izenačeno skupino: medsebojni match točke → medsebojna boule razlika → skupna boule razlika → ime. */
function rankTiedGroup(
  group: TeamStats[],
  fixtures: LeagueFixture[],
  boule: Record<string, { home: number; away: number }>,
): void {
  const ids = new Set(group.map(g => g.team.id))
  const h2h = new Map<string, { pts: number; bouleDiff: number }>()
  for (const g of group) h2h.set(g.team.id, { pts: 0, bouleDiff: 0 })

  for (const f of fixtures) {
    if (f.status !== 'completed') continue
    if (!ids.has(f.home_team_id) || !ids.has(f.away_team_id)) continue
    const hs = f.home_score ?? 0, as_ = f.away_score ?? 0
    const b = boule[f.id] ?? { home: 0, away: 0 }
    const mh = h2h.get(f.home_team_id)!, ma = h2h.get(f.away_team_id)!
    mh.pts += hs; ma.pts += as_
    mh.bouleDiff += (b.home - b.away); ma.bouleDiff += (b.away - b.home)
  }

  group.sort((a, b) => {
    const A = h2h.get(a.team.id)!, B = h2h.get(b.team.id)!
    if (B.pts !== A.pts) return B.pts - A.pts                         // 2. medsebojni match točke
    if (B.bouleDiff !== A.bouleDiff) return B.bouleDiff - A.bouleDiff // 3. medsebojna boule razlika
    if (b.bouleDiff !== a.bouleDiff) return b.bouleDiff - a.bouleDiff // 4. skupna boule razlika
    return a.team.club_name.localeCompare(b.team.club_name)
  })
}

// ────────────────────────────────────────────────────────────────
// CALCULATE STANDINGS FROM FIXTURE LIST
// ────────────────────────────────────────────────────────────────
export function calculateStandings(
  teams: LeagueTeam[],
  fixtures: LeagueFixture[],
  season: Pick<LeagueSeason, 'win_points' | 'draw_points' | 'loss_points' | 'rounds_count'> | null,
  matchResults?: MatchResultWithDisc[],
): TeamStats[] {
  const winPts  = season?.win_points  ?? 2
  const drawPts = season?.draw_points ?? 1
  const lossPts = season?.loss_points ?? 0
  const regularRounds = season?.rounds_count ?? Infinity
  const boule = bouleByFixture(matchResults)

  const stats: Record<string, TeamStats> = {}
  for (const team of teams) stats[team.id] = emptyStats(team)

  const counted: LeagueFixture[] = []
  for (const fixture of fixtures) {
    if (fixture.status !== 'completed') continue
    if (fixture.round_number > regularRounds) continue   // izloči končnico
    const h = stats[fixture.home_team_id]
    const a = stats[fixture.away_team_id]
    if (!h || !a) continue
    accumulate(h, a, fixture.home_score ?? 0, fixture.away_score ?? 0, boule[fixture.id])
    counted.push(fixture)
  }

  // Točke: zmaga 2 / remi 1 / poraz 0 (kriterij 1)
  for (const s of Object.values(stats)) s.points = s.won * winPts + s.drawn * drawPts + s.lost * lossPts
  return sortStandings(Object.values(stats), counted, boule)
}

// Ligaški razpored po Bergerjevem sistemu je v engines/berger.ts.

// ────────────────────────────────────────────────────────────────
// GET FIXTURES FOR A SPECIFIC ROUND
// ────────────────────────────────────────────────────────────────
export function getFixturesByRound(fixtures: LeagueFixture[]): Record<number, LeagueFixture[]> {
  const byRound: Record<number, LeagueFixture[]> = {}
  for (const f of fixtures) {
    if (!byRound[f.round_number]) byRound[f.round_number] = []
    byRound[f.round_number].push(f)
  }
  return byRound
}

// ────────────────────────────────────────────────────────────────
// GROUP-LEAGUE STANDINGS (skupinski sistem z nadaljevanjem)
//   'A' / 'B'      → phase-1 skupini
//   '1-6' / '7-12' → phase-2 nadaljevalni skupini (carry-over iz faze 1)
// ────────────────────────────────────────────────────────────────
export interface GroupStandings {
  hasGroups: boolean
  phase1: { A: TeamStats[]; B: TeamStats[] }
  phase2: { '1-6': TeamStats[]; '7-12': TeamStats[] } | null
}

export function calculateGroupStandings(
  teams: LeagueTeam[],
  fixtures: LeagueFixture[],
  season: Pick<LeagueSeason, 'win_points' | 'draw_points' | 'loss_points'> | null,
  matchResults?: MatchResultWithDisc[],
): GroupStandings {
  const winPts  = season?.win_points  ?? 2
  const drawPts = season?.draw_points ?? 1
  const lossPts = season?.loss_points ?? 0
  const boule = bouleByFixture(matchResults)
  const phase1A = fixtures.filter(f => f.group_label === 'A')
  const phase1B = fixtures.filter(f => f.group_label === 'B')

  if (phase1A.length === 0 && phase1B.length === 0) {
    return { hasGroups: false, phase1: { A: [], B: [] }, phase2: null }
  }

  const phase2_16  = fixtures.filter(f => f.group_label === '1-6')
  const phase2_712 = fixtures.filter(f => f.group_label === '7-12')

  function getIds(list: LeagueFixture[]): Set<string> {
    const s = new Set<string>()
    for (const f of list) { s.add(f.home_team_id); s.add(f.away_team_id) }
    return s
  }

  function buildStats(teamIds: Set<string>, fixtureList: LeagueFixture[]): TeamStats[] {
    const relevantTeams = teams.filter(t => teamIds.has(t.id))
    const stats: Record<string, TeamStats> = {}
    for (const team of relevantTeams) stats[team.id] = emptyStats(team)
    const counted: LeagueFixture[] = []
    for (const f of fixtureList) {
      if (f.status !== 'completed') continue
      const h = stats[f.home_team_id]
      const a = stats[f.away_team_id]
      if (!h || !a) continue
      accumulate(h, a, f.home_score ?? 0, f.away_score ?? 0, boule[f.id])
      counted.push(f)
    }
    for (const s of Object.values(stats)) s.points = s.won * winPts + s.drawn * drawPts + s.lost * lossPts
    return sortStandings(Object.values(stats), counted, boule)
  }

  const idsA    = getIds(phase1A)
  const idsB    = getIds(phase1B)
  const ids_16  = getIds(phase2_16)
  const ids_712 = getIds(phase2_712)

  const allPhase1     = [...phase1A, ...phase1B]
  const carryOver_16  = allPhase1.filter(f => ids_16.has(f.home_team_id)  && ids_16.has(f.away_team_id))
  const carryOver_712 = allPhase1.filter(f => ids_712.has(f.home_team_id) && ids_712.has(f.away_team_id))

  const hasPhase2 = phase2_16.length > 0 || phase2_712.length > 0

  return {
    hasGroups: true,
    phase1: { A: buildStats(idsA, phase1A), B: buildStats(idsB, phase1B) },
    phase2: hasPhase2 ? {
      '1-6':  buildStats(ids_16,  [...carryOver_16,  ...phase2_16]),
      '7-12': buildStats(ids_712, [...carryOver_712, ...phase2_712]),
    } : null,
  }
}

// ────────────────────────────────────────────────────────────────
// HEAD-TO-HEAD COMPARISON (tiebreaker helper — javno dostopen)
// ────────────────────────────────────────────────────────────────
export function headToHead(
  teamIdA: string,
  teamIdB: string,
  fixtures: LeagueFixture[],
): { winsA: number; winsB: number; pointsA: number; pointsB: number } {
  const relevant = fixtures.filter(f =>
    f.status === 'completed' &&
    ((f.home_team_id === teamIdA && f.away_team_id === teamIdB) ||
     (f.home_team_id === teamIdB && f.away_team_id === teamIdA))
  )

  let wA = 0, wB = 0, ptsA = 0, ptsB = 0
  for (const f of relevant) {
    const hs  = f.home_score ?? 0
    const as_ = f.away_score ?? 0
    if (f.home_team_id === teamIdA) {
      ptsA += hs; ptsB += as_
      if (hs > as_) wA++; else if (as_ > hs) wB++
    } else {
      ptsA += as_; ptsB += hs
      if (as_ > hs) wA++; else if (hs > as_) wB++
    }
  }

  return { winsA: wA, winsB: wB, pointsA: ptsA, pointsB: ptsB }
}
