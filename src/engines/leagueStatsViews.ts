import type {
  DisciplineType, LeagueSeasonDiscipline, LeagueFixture,
  LeagueMatchResult, LeagueMatchDisciplineResult,
} from '../types'
import { aggregateTeamDisciplineStats, type PlayerSeasonStat } from './leagueStats'

/** Discipline s številčnim rezultatom → prikažemo povprečje doseženega. */
export const AVERAGE_DISCIPLINES: ReadonlySet<DisciplineType> = new Set<DisciplineType>([
  'hitrostno', 'natancno', 'stafeta', 'krog', 'blizanje', 'blizanje_krog',
])
export function showsAverage(t: DisciplineType): boolean {
  return AVERAGE_DISCIPLINES.has(t)
}

export interface DisciplineSection<Row> {
  discipline: LeagueSeasonDiscipline
  rows: Row[]
}

export interface DisciplinePlayerRow {
  playerId: string
  played: number
  matchPointsFor: number
  scoreFor: number
  average: number
}

/** Za vsako disciplino seznam igralcev (iz njihovih byDiscipline), razvrščen po točkah. */
export function playersByDiscipline(
  stats: PlayerSeasonStat[],
  disciplines: LeagueSeasonDiscipline[],
): DisciplineSection<DisciplinePlayerRow>[] {
  return disciplines.map(discipline => {
    const rows: DisciplinePlayerRow[] = []
    for (const ps of stats) {
      const d = ps.byDiscipline.find(b => b.disciplineId === discipline.id)
      if (!d || d.played === 0) continue
      rows.push({
        playerId: ps.playerId,
        played: d.played,
        matchPointsFor: d.matchPointsFor,
        scoreFor: d.scoreFor,
        average: d.played > 0 ? d.scoreFor / d.played : 0,
      })
    }
    rows.sort((a, b) => b.matchPointsFor - a.matchPointsFor || b.average - a.average)
    return { discipline, rows }
  })
}

export interface DisciplineTeamRow {
  teamId: string
  played: number
  matchPointsFor: number
  scoreFor: number
  average: number
}

/** Za vsako disciplino seznam ekip (kliče aggregateTeamDisciplineStats na ekipo), razvrščen po točkah. */
export function teamsByDiscipline(
  teamIds: string[],
  fixtures: LeagueFixture[],
  matchResults: Array<LeagueMatchResult & { discipline_results?: LeagueMatchDisciplineResult[] }>,
  disciplines: LeagueSeasonDiscipline[],
): DisciplineSection<DisciplineTeamRow>[] {
  const perTeam = new Map<string, Map<string, { played: number; matchPointsFor: number; scoreFor: number }>>()
  for (const teamId of teamIds) {
    const m = new Map<string, { played: number; matchPointsFor: number; scoreFor: number }>()
    for (const s of aggregateTeamDisciplineStats(teamId, fixtures, matchResults, disciplines)) {
      m.set(s.disciplineId, { played: s.played, matchPointsFor: s.matchPointsFor, scoreFor: s.scoreFor })
    }
    perTeam.set(teamId, m)
  }
  return disciplines.map(discipline => {
    const rows: DisciplineTeamRow[] = []
    for (const teamId of teamIds) {
      const s = perTeam.get(teamId)?.get(discipline.id)
      if (!s || s.played === 0) continue
      rows.push({
        teamId,
        played: s.played,
        matchPointsFor: s.matchPointsFor,
        scoreFor: s.scoreFor,
        average: s.played > 0 ? s.scoreFor / s.played : 0,
      })
    }
    rows.sort((a, b) => b.matchPointsFor - a.matchPointsFor || b.average - a.average)
    return { discipline, rows }
  })
}
