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

/** Prikazna oznaka tipa discipline (več instanc, npr. "DVOJKA 1/2/3", se združi v eno). */
export const DISCIPLINE_TYPE_LABELS: Record<DisciplineType, string> = {
  posamezno: 'Posamezno',
  dvojka: 'Dvojka',
  trojka: 'Trojka',
  krog: 'Igra v krog',
  hitrostno: 'Hitrostno izbijanje',
  natancno: 'Natančno izbijanje',
  blizanje: 'Natančno bližanje',
  blizanje_krog: 'Bližanje v krog',
  stafeta: 'Štafeta',
  podaljsek: 'Podaljšek',
}

/** Skupina po tipu discipline (instance istega tipa so združene). */
export interface DisciplineGroup<Row> {
  type: DisciplineType
  label: string
  rows: Row[]
}

/** Unikatni tipi disciplin v vrstnem redu prve pojavitve. */
function orderedTypes(disciplines: LeagueSeasonDiscipline[]): DisciplineType[] {
  const seen = new Set<DisciplineType>()
  const out: DisciplineType[] = []
  for (const d of disciplines) {
    if (!seen.has(d.discipline_type)) { seen.add(d.discipline_type); out.push(d.discipline_type) }
  }
  return out
}

export interface DisciplinePlayerRow {
  playerId: string
  played: number
  matchPointsFor: number
  scoreFor: number
  average: number
}

/** Za vsak TIP discipline seznam igralcev (združene instance), razvrščen po točkah. */
export function playersByDiscipline(
  stats: PlayerSeasonStat[],
  disciplines: LeagueSeasonDiscipline[],
): DisciplineGroup<DisciplinePlayerRow>[] {
  return orderedTypes(disciplines).map(type => {
    const rows: DisciplinePlayerRow[] = []
    for (const ps of stats) {
      let played = 0, matchPointsFor = 0, scoreFor = 0
      for (const d of ps.byDiscipline) {
        if (d.disciplineType !== type) continue
        played += d.played
        matchPointsFor += d.matchPointsFor
        scoreFor += d.scoreFor
      }
      if (played === 0) continue
      rows.push({ playerId: ps.playerId, played, matchPointsFor, scoreFor, average: scoreFor / played })
    }
    rows.sort((a, b) => b.matchPointsFor - a.matchPointsFor || b.average - a.average)
    return { type, label: DISCIPLINE_TYPE_LABELS[type] ?? type, rows }
  })
}

export interface DisciplineTeamRow {
  teamId: string
  played: number
  matchPointsFor: number
  scoreFor: number
  average: number
}

/** Za vsak TIP discipline seznam ekip (združene instance), razvrščen po točkah. */
export function teamsByDiscipline(
  teamIds: string[],
  fixtures: LeagueFixture[],
  matchResults: Array<LeagueMatchResult & { discipline_results?: LeagueMatchDisciplineResult[] }>,
  disciplines: LeagueSeasonDiscipline[],
): DisciplineGroup<DisciplineTeamRow>[] {
  type Tot = { played: number; matchPointsFor: number; scoreFor: number }
  const perTeam = new Map<string, Map<DisciplineType, Tot>>()
  for (const teamId of teamIds) {
    const m = new Map<DisciplineType, Tot>()
    for (const s of aggregateTeamDisciplineStats(teamId, fixtures, matchResults, disciplines)) {
      const cur = m.get(s.disciplineType) ?? { played: 0, matchPointsFor: 0, scoreFor: 0 }
      cur.played += s.played
      cur.matchPointsFor += s.matchPointsFor
      cur.scoreFor += s.scoreFor
      m.set(s.disciplineType, cur)
    }
    perTeam.set(teamId, m)
  }
  return orderedTypes(disciplines).map(type => {
    const rows: DisciplineTeamRow[] = []
    for (const teamId of teamIds) {
      const s = perTeam.get(teamId)?.get(type)
      if (!s || s.played === 0) continue
      rows.push({ teamId, played: s.played, matchPointsFor: s.matchPointsFor, scoreFor: s.scoreFor, average: s.scoreFor / s.played })
    }
    rows.sort((a, b) => b.matchPointsFor - a.matchPointsFor || b.average - a.average)
    return { type, label: DISCIPLINE_TYPE_LABELS[type] ?? type, rows }
  })
}
