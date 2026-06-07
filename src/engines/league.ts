/**
 * BOCCE LEAGUE ENGINE
 * Calculates standings for the national team championship (državno ekipno prvenstvo).
 * Supports configurable points for win/draw/loss and standard tiebreakers.
 */

import type { LeagueTeam, LeagueFixture, LeagueSeason, TeamStats } from '../types'

// ────────────────────────────────────────────────────────────────
// CALCULATE STANDINGS FROM FIXTURE LIST
// ────────────────────────────────────────────────────────────────
export function calculateStandings(
  teams: LeagueTeam[],
  fixtures: LeagueFixture[],
  season: Pick<LeagueSeason, 'win_points' | 'draw_points' | 'loss_points' | 'rounds_count'> | null,
): TeamStats[] {
  const winPts  = season?.win_points  ?? 2
  const drawPts = season?.draw_points ?? 1
  const lossPts = season?.loss_points ?? 0
  const regularRounds = season?.rounds_count ?? Infinity

  const stats: Record<string, TeamStats> = {}
  for (const team of teams) {
    stats[team.id] = {
      team,
      played: 0, won: 0, drawn: 0, lost: 0,
      pointsFor: 0, pointsAgainst: 0, difference: 0, points: 0,
    }
  }

  for (const fixture of fixtures) {
    if (fixture.status !== 'completed') continue
    // Exclude playoff fixtures from standings
    if (fixture.round_number > regularRounds) continue
    const h = stats[fixture.home_team_id]
    const a = stats[fixture.away_team_id]
    if (!h || !a) continue

    const hs  = fixture.home_score ?? 0
    const as_ = fixture.away_score ?? 0

    h.played++; a.played++
    h.pointsFor += hs;  h.pointsAgainst += as_
    a.pointsFor += as_; a.pointsAgainst += hs

    if (hs > as_) {
      h.won++; a.lost++
      h.points += winPts; a.points += lossPts
    } else if (as_ > hs) {
      a.won++; h.lost++
      a.points += winPts; h.points += lossPts
    } else {
      h.drawn++; a.drawn++
      h.points += drawPts; a.points += drawPts
    }
  }

  for (const s of Object.values(stats)) {
    s.difference = s.pointsFor - s.pointsAgainst
  }

  return Object.values(stats).sort((a, b) => {
    if (b.points     !== a.points)     return b.points     - a.points
    if (b.difference !== a.difference) return b.difference - a.difference
    if (b.pointsFor  !== a.pointsFor)  return b.pointsFor  - a.pointsFor
    return a.team.club_name.localeCompare(b.team.club_name)
  })
}

// ────────────────────────────────────────────────────────────────
// GENERATE ROUND-ROBIN FIXTURES (home & away)
// ────────────────────────────────────────────────────────────────
type MinTeam = Pick<LeagueTeam, 'id' | 'club_name'>

interface FixtureInput {
  round_number: number
  home_team_id: string
  away_team_id: string
  home_team: MinTeam
  away_team: MinTeam
}

export function generateRoundRobin(teams: MinTeam[], doubleRound = true): FixtureInput[] {
  const n = teams.length
  const list: (MinTeam & { id: string })[] = [...teams]

  if (n % 2 !== 0) list.push({ id: 'BYE', club_name: 'Prosta' })
  const m = list.length
  const numRounds = m - 1
  const rounds: FixtureInput[][] = []

  for (let round = 0; round < numRounds; round++) {
    const pairs: FixtureInput[] = []
    for (let i = 0; i < m / 2; i++) {
      const home = list[i]
      const away = list[m - 1 - i]
      if (home.id !== 'BYE' && away.id !== 'BYE') {
        pairs.push({
          round_number: round + 1,
          home_team_id: home.id,
          away_team_id: away.id,
          home_team: home,
          away_team: away,
        })
      }
    }
    rounds.push(pairs)
    list.splice(1, 0, list.pop()!)
  }

  if (doubleRound) {
    const firstHalf = rounds.flat()
    const secondHalf = rounds.flatMap((roundFixtures, roundIdx) =>
      roundFixtures.map(f => ({
        ...f,
        round_number: numRounds + roundIdx + 1,
        home_team_id: f.away_team_id,
        away_team_id: f.home_team_id,
        home_team: f.away_team,
        away_team: f.home_team,
      }))
    )
    return [...firstHalf, ...secondHalf]
  }

  return rounds.flat()
}

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
// Used for leagues that have group_label values on fixtures:
//   'A' / 'B'     → phase-1 skupini
//   '1-6' / '7-12' → phase-2 nadaljevalni skupini (carry-over from phase 1)
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
): GroupStandings {
  const winPts  = season?.win_points  ?? 2
  const drawPts = season?.draw_points ?? 1
  const lossPts = season?.loss_points ?? 0

  const phase1A    = fixtures.filter(f => f.group_label === 'A')
  const phase1B    = fixtures.filter(f => f.group_label === 'B')

  if (phase1A.length === 0 && phase1B.length === 0) {
    return { hasGroups: false, phase1: { A: [], B: [] }, phase2: null }
  }

  const phase2_16  = fixtures.filter(f => f.group_label === '1-6')
  const phase2_712 = fixtures.filter(f => f.group_label === '7-12')

  /** Collect all unique team IDs that appear in a list of fixtures. */
  function getIds(list: LeagueFixture[]): Set<string> {
    const s = new Set<string>()
    for (const f of list) { s.add(f.home_team_id); s.add(f.away_team_id) }
    return s
  }

  /** Build a sorted standings array for the given team-set and fixture list. */
  function buildStats(teamIds: Set<string>, fixtureList: LeagueFixture[]): TeamStats[] {
    const relevantTeams = teams.filter(t => teamIds.has(t.id))
    const stats: Record<string, TeamStats> = {}
    for (const team of relevantTeams) {
      stats[team.id] = {
        team, played: 0, won: 0, drawn: 0, lost: 0,
        pointsFor: 0, pointsAgainst: 0, difference: 0, points: 0,
      }
    }
    for (const f of fixtureList) {
      if (f.status !== 'completed') continue
      const h = stats[f.home_team_id]
      const a = stats[f.away_team_id]
      if (!h || !a) continue
      const hs  = f.home_score ?? 0
      const as_ = f.away_score ?? 0
      h.played++; a.played++
      h.pointsFor += hs;  h.pointsAgainst += as_
      a.pointsFor += as_; a.pointsAgainst += hs
      if (hs > as_) {
        h.won++;  a.lost++;  h.points += winPts;  a.points += lossPts
      } else if (as_ > hs) {
        a.won++;  h.lost++;  a.points += winPts;  h.points += lossPts
      } else {
        h.drawn++; a.drawn++; h.points += drawPts; a.points += drawPts
      }
    }
    for (const s of Object.values(stats)) s.difference = s.pointsFor - s.pointsAgainst
    return Object.values(stats).sort((a, b) => {
      if (b.points     !== a.points)     return b.points     - a.points
      if (b.difference !== a.difference) return b.difference - a.difference
      if (b.pointsFor  !== a.pointsFor)  return b.pointsFor  - a.pointsFor
      return a.team.club_name.localeCompare(b.team.club_name)
    })
  }

  const idsA    = getIds(phase1A)
  const idsB    = getIds(phase1B)
  const ids_16  = getIds(phase2_16)
  const ids_712 = getIds(phase2_712)

  // Carry-over: phase-1 fixtures between teams that BOTH end up in the same phase-2 group
  const allPhase1      = [...phase1A, ...phase1B]
  const carryOver_16   = allPhase1.filter(f => ids_16.has(f.home_team_id)  && ids_16.has(f.away_team_id))
  const carryOver_712  = allPhase1.filter(f => ids_712.has(f.home_team_id) && ids_712.has(f.away_team_id))

  const hasPhase2 = phase2_16.length > 0 || phase2_712.length > 0

  return {
    hasGroups: true,
    phase1: {
      A: buildStats(idsA, phase1A),
      B: buildStats(idsB, phase1B),
    },
    phase2: hasPhase2 ? {
      '1-6':  buildStats(ids_16,  [...carryOver_16,  ...phase2_16]),
      '7-12': buildStats(ids_712, [...carryOver_712, ...phase2_712]),
    } : null,
  }
}

// ────────────────────────────────────────────────────────────────
// HEAD-TO-HEAD COMPARISON (tiebreaker)
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
