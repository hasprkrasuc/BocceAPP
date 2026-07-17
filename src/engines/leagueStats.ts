/**
 * LEAGUE STATISTICS ENGINE
 *
 * Aggregates discipline-level and player-level stats from stored match results.
 * Players are stored as UUIDs (from the roster picker) or plain name strings
 * (free-text fallback). Both formats are handled uniformly — the calling page
 * is responsible for resolving UUIDs to display names via the users table.
 *
 * Standings (team league table) are already handled by calculateStandings()
 * in league.ts — re-exported here for convenience.
 */

import type {
  LeagueFixture,
  LeagueMatchResult,
  LeagueMatchDisciplineResult,
  LeagueSeasonDiscipline,
  DisciplineType,
} from '../types'

// ─── Rang lestvica constants ──────────────────────────────────────────────────

/** League tier → rang weight coefficient (Super liga 1.3 → OL 0.5) */
export const LIGA_KOEF: Record<string, number> = {
  super_liga:      1.3,
  '1_liga':        1.0,
  '2_liga_zahod':  0.8,
  '2_liga_vzhod':  0.8,
}

export const DEFAULT_LIGA_KOEF = 0.5   // območne/ostale

/** Discipline type → rang utežni faktor (50 % / 75 % / 100 %) */
const DISC_WEIGHT: Partial<Record<DisciplineType, number>> = {
  posamezno:    1.00,
  krog:         1.00,
  blizanje_krog: 1.00, // igra se 1 na 1 kot Igra v krog
  dvojka:       0.75,
  trojka:     0.50,
  stafeta:    0.50,
  natancno:   0.50,
  blizanje:   0.50,
  hitrostno:  0.50,
  podaljsek:  0.50,
}

export { calculateStandings } from './league'

// ─── Team × Discipline stats ──────────────────────────────────────────────────

export interface TeamDisciplineStat {
  disciplineId: string
  disciplineName: string
  disciplineType: DisciplineType
  blockNumber: number
  played: number
  /** Match points earned (2 per discipline win, 0 for loss) */
  matchPointsFor: number
  matchPointsAgainst: number
  /** Total punt scored / conceded */
  scoreFor: number
  scoreAgainst: number
  /** Win rate 0–1 */
  winRate: number
}

/**
 * Compute discipline-by-discipline stats for a single team across all
 * completed fixtures in a season.
 *
 * @param teamId        The league_teams.id to aggregate for
 * @param fixtures      All fixtures for the season (completed + scheduled)
 * @param matchResults  Match results WITH discipline_results pre-loaded
 * @param disciplines   Season disciplines (for ordering and metadata)
 */
export function aggregateTeamDisciplineStats(
  teamId: string,
  fixtures: LeagueFixture[],
  matchResults: Array<LeagueMatchResult & { discipline_results?: LeagueMatchDisciplineResult[] }>,
  disciplines: LeagueSeasonDiscipline[],
): TeamDisciplineStat[] {
  const discMap = Object.fromEntries(disciplines.map(d => [d.id, d]))
  const resultByFixture = Object.fromEntries(matchResults.map(r => [r.fixture_id, r]))
  const acc: Record<string, Omit<TeamDisciplineStat, 'winRate'>> = {}

  for (const fixture of fixtures) {
    if (fixture.status !== 'completed') continue
    const isHome = fixture.home_team_id === teamId
    const isAway = fixture.away_team_id === teamId
    if (!isHome && !isAway) continue

    const mr = resultByFixture[fixture.id]
    if (!mr?.discipline_results) continue

    for (const dr of mr.discipline_results) {
      const disc = discMap[dr.discipline_id]
      if (!disc) continue

      if (!acc[disc.id]) {
        acc[disc.id] = {
          disciplineId: disc.id,
          disciplineName: disc.name,
          disciplineType: disc.discipline_type,
          blockNumber: disc.block_number,
          played: 0,
          matchPointsFor: 0,
          matchPointsAgainst: 0,
          scoreFor: 0,
          scoreAgainst: 0,
        }
      }

      const s = acc[disc.id]
      s.played++

      if (isHome) {
        s.matchPointsFor     += dr.home_match_points ?? 0
        s.matchPointsAgainst += dr.away_match_points ?? 0
        s.scoreFor           += dr.home_score ?? 0
        s.scoreAgainst       += dr.away_score ?? 0
      } else {
        s.matchPointsFor     += dr.away_match_points ?? 0
        s.matchPointsAgainst += dr.home_match_points ?? 0
        s.scoreFor           += dr.away_score ?? 0
        s.scoreAgainst       += dr.home_score ?? 0
      }
    }
  }

  return Object.values(acc)
    .map(s => ({
      ...s,
      winRate: s.played > 0 ? s.matchPointsFor / (s.matchPointsFor + s.matchPointsAgainst || 1) : 0,
    }))
    .sort((a, b) => {
      const ia = disciplines.findIndex(d => d.id === a.disciplineId)
      const ib = disciplines.findIndex(d => d.id === b.disciplineId)
      return ia - ib
    })
}

// ─── Player stats ─────────────────────────────────────────────────────────────

export interface PlayerDisciplineStat {
  disciplineId: string
  disciplineName: string
  disciplineType: DisciplineType
  blockNumber: number
  played: number
  matchPointsFor: number
  scoreFor: number
  scoreAgainst: number
}

export interface PlayerSeasonStat {
  /** UUID when player was selected from roster; plain name string for free-text entries */
  playerId: string
  totalPlayed: number
  totalMatchPointsFor: number
  totalScoreFor: number
  byDiscipline: PlayerDisciplineStat[]
}

/**
 * Aggregate per-player stats from all completed match discipline results.
 *
 * home_players / away_players arrays store:
 *   - UUID strings when the player was chosen from the team roster
 *   - Plain "Ime Priimek" strings when entered as free text (no roster linked)
 *   - "R: <id ali ime>" prefix for reserves — a reserve who entered the lineup
 *     as a substitution. They actually played, so they ARE included in stats
 *     under their stripped identity (see stripReserve/isReserve below).
 *
 * The caller is responsible for resolving UUIDs to display names by joining
 * against the users table.
 */

/** Vpis v postavi je lahko "R: <id ali ime>" — rezerva, ki je vstopila kot menjava. Šteje kot nastop. */
export const stripReserve = (p: string): string => p.startsWith('R: ') ? p.slice(3) : p
export const isReserve = (p: string): boolean => p.startsWith('R: ')
export function aggregatePlayerStats(
  matchResults: Array<LeagueMatchResult & { discipline_results?: LeagueMatchDisciplineResult[] }>,
  fixtures: LeagueFixture[],
  disciplines: LeagueSeasonDiscipline[],
): PlayerSeasonStat[] {
  const discMap = Object.fromEntries(disciplines.map(d => [d.id, d]))
  const fixtureMap = Object.fromEntries(fixtures.map(f => [f.id, f]))

  // acc[playerId][disciplineId] → running totals
  const acc: Record<string, Record<string, {
    played: number
    matchPointsFor: number
    scoreFor: number
    scoreAgainst: number
  }>> = {}

  function record(
    playerId: string,
    discId: string,
    matchPoints: number,
    scoreFor: number,
    scoreAgainst: number,
  ) {
    if (!acc[playerId]) acc[playerId] = {}
    if (!acc[playerId][discId]) {
      acc[playerId][discId] = { played: 0, matchPointsFor: 0, scoreFor: 0, scoreAgainst: 0 }
    }
    acc[playerId][discId].played++
    acc[playerId][discId].matchPointsFor += matchPoints
    acc[playerId][discId].scoreFor       += scoreFor
    acc[playerId][discId].scoreAgainst   += scoreAgainst
  }

  for (const mr of matchResults) {
    const fixture = fixtureMap[mr.fixture_id]
    if (!fixture || fixture.status !== 'completed') continue
    if (!mr.discipline_results) continue

    for (const dr of mr.discipline_results) {
      if (!discMap[dr.discipline_id]) continue

      for (const pid of (dr.home_players ?? [])) {
        if (!pid) continue
        record(stripReserve(pid), dr.discipline_id,
          dr.home_match_points ?? 0,
          dr.home_score        ?? 0,
          dr.away_score        ?? 0,
        )
      }

      for (const pid of (dr.away_players ?? [])) {
        if (!pid) continue
        record(stripReserve(pid), dr.discipline_id,
          dr.away_match_points ?? 0,
          dr.away_score        ?? 0,
          dr.home_score        ?? 0,
        )
      }
    }
  }

  return Object.entries(acc).map(([playerId, byDisc]) => {
    const byDiscipline: PlayerDisciplineStat[] = Object.entries(byDisc)
      .map(([discId, s]) => {
        const disc = discMap[discId]
        return {
          disciplineId:   discId,
          disciplineName: disc?.name ?? discId,
          disciplineType: disc?.discipline_type ?? 'posamezno',
          blockNumber:    disc?.block_number ?? 0,
          played:         s.played,
          matchPointsFor: s.matchPointsFor,
          scoreFor:       s.scoreFor,
          scoreAgainst:   s.scoreAgainst,
        }
      })
      .sort((a, b) => {
        const ia = disciplines.findIndex(d => d.id === a.disciplineId)
        const ib = disciplines.findIndex(d => d.id === b.disciplineId)
        return ia - ib
      })

    return {
      playerId,
      totalPlayed:         byDiscipline.reduce((n, d) => n + d.played, 0),
      totalMatchPointsFor: byDiscipline.reduce((n, d) => n + d.matchPointsFor, 0),
      totalScoreFor:       byDiscipline.reduce((n, d) => n + d.scoreFor, 0),
      byDiscipline,
    }
  }).sort((a, b) => b.totalMatchPointsFor - a.totalMatchPointsFor)
}

// ─── Season totals helper ─────────────────────────────────────────────────────

export interface SeasonDisciplineTotals {
  disciplineId: string
  disciplineName: string
  disciplineType: DisciplineType
  totalGames: number      // home + away combined
  homeWinRate: number     // across all teams
  avgScorePerGame: number
}

/**
 * Season-wide discipline totals — useful for ranking which disciplines are
 * most competitive or high-scoring.
 */
export function aggregateSeasonDisciplineTotals(
  matchResults: Array<LeagueMatchResult & { discipline_results?: LeagueMatchDisciplineResult[] }>,
  fixtures: LeagueFixture[],
  disciplines: LeagueSeasonDiscipline[],
): SeasonDisciplineTotals[] {
  const discMap = Object.fromEntries(disciplines.map(d => [d.id, d]))
  const completedFixtureIds = new Set(
    fixtures.filter(f => f.status === 'completed').map(f => f.id),
  )

  const acc: Record<string, {
    games: number; homeWins: number; totalScore: number
  }> = {}

  for (const mr of matchResults) {
    if (!completedFixtureIds.has(mr.fixture_id)) continue
    for (const dr of (mr.discipline_results ?? [])) {
      if (!discMap[dr.discipline_id]) continue
      if (!acc[dr.discipline_id]) acc[dr.discipline_id] = { games: 0, homeWins: 0, totalScore: 0 }
      acc[dr.discipline_id].games++
      if ((dr.home_match_points ?? 0) === 2) acc[dr.discipline_id].homeWins++
      acc[dr.discipline_id].totalScore += (dr.home_score ?? 0) + (dr.away_score ?? 0)
    }
  }

  return Object.entries(acc).map(([discId, s]) => {
    const disc = discMap[discId]
    return {
      disciplineId:   discId,
      disciplineName: disc?.name ?? discId,
      disciplineType: disc?.discipline_type ?? 'posamezno',
      totalGames:     s.games,
      homeWinRate:    s.games > 0 ? s.homeWins / s.games : 0,
      avgScorePerGame: s.games > 0 ? s.totalScore / (s.games * 2) : 0,
    }
  }).sort((a, b) => {
    const ia = disciplines.findIndex(d => d.id === a.disciplineId)
    const ib = disciplines.findIndex(d => d.id === b.disciplineId)
    return ia - ib
  })
}

// ─── Rang lestvica calculation ────────────────────────────────────────────────

export interface PlayerRangEntry {
  playerId: string
  /** Final rang score for this season contribution */
  rang: number
  /** Σ(discipline matchPointsFor × discWeight) before multipliers */
  weightedPoints: number
  /** Liga tier coefficient applied */
  ligaKoef: number
  /** totalMatchPointsFor / (totalPlayed × 2), range 0–1 */
  uspesnostPct: number
  totalPlayed: number
  totalMatchPointsFor: number
}

/**
 * Compute the rang score for one player in one season.
 *
 * rang = weightedMatchPoints × ligaKoef × uspesnostPct
 *
 * Weights:  posamezno/krog = 100 %,  dvojka = 75 %,
 *           trojka/štafeta/natančno/hitrostno = 50 %
 */
export function calculateRang(
  playerStat: PlayerSeasonStat,
  seasonTier: string,
): PlayerRangEntry {
  const ligaKoef = LIGA_KOEF[seasonTier] ?? DEFAULT_LIGA_KOEF

  const weightedPoints = playerStat.byDiscipline.reduce((sum, d) => {
    const w = DISC_WEIGHT[d.disciplineType] ?? 0.50
    return sum + w * d.matchPointsFor
  }, 0)

  const totalPossible = playerStat.totalPlayed * 2
  const uspesnostPct = totalPossible > 0
    ? playerStat.totalMatchPointsFor / totalPossible
    : 0

  return {
    playerId: playerStat.playerId,
    rang: weightedPoints * ligaKoef * uspesnostPct,
    weightedPoints,
    ligaKoef,
    uspesnostPct,
    totalPlayed: playerStat.totalPlayed,
    totalMatchPointsFor: playerStat.totalMatchPointsFor,
  }
}
