import { describe, test, expect } from 'vitest'
import { showsAverage, playersByDiscipline, teamsByDiscipline, AVERAGE_DISCIPLINES, DISCIPLINE_TYPE_LABELS } from './leagueStatsViews'
import type { PlayerSeasonStat } from './leagueStats'
import type { LeagueFixture, LeagueMatchResult, LeagueMatchDisciplineResult, LeagueSeasonDiscipline } from '../types'

// Dve instanci DVOJKA (d3, d4) + ena POSAMEZNO (d1) + ena HITROSTNO (d2)
const discs: LeagueSeasonDiscipline[] = [
  { id: 'd1', season_id: 's', name: 'POSAMEZNO 1', discipline_type: 'posamezno', players_per_side: 1, has_reserve: false, block_number: 1, order_num: 1 },
  { id: 'd3', season_id: 's', name: 'DVOJKA 1', discipline_type: 'dvojka', players_per_side: 2, has_reserve: false, block_number: 1, order_num: 2 },
  { id: 'd4', season_id: 's', name: 'DVOJKA 2', discipline_type: 'dvojka', players_per_side: 2, has_reserve: false, block_number: 1, order_num: 3 },
  { id: 'd2', season_id: 's', name: 'HITROSTNO', discipline_type: 'hitrostno', players_per_side: 1, has_reserve: false, block_number: 3, order_num: 4 },
]

describe('showsAverage', () => {
  test('velja za 6 številčnih disciplin', () => {
    for (const t of ['hitrostno', 'natancno', 'stafeta', 'krog', 'blizanje', 'blizanje_krog'] as const)
      expect(showsAverage(t)).toBe(true)
    expect(AVERAGE_DISCIPLINES.size).toBe(6)
  })
  test('ne velja za dvoboje', () => {
    for (const t of ['posamezno', 'dvojka', 'trojka', 'podaljsek'] as const)
      expect(showsAverage(t)).toBe(false)
  })
})

describe('DISCIPLINE_TYPE_LABELS', () => {
  test('ima oznake za uporabljene tipe', () => {
    expect(DISCIPLINE_TYPE_LABELS.dvojka).toBe('Dvojka')
    expect(DISCIPLINE_TYPE_LABELS.krog).toBe('Igra v krog')
    expect(DISCIPLINE_TYPE_LABELS.natancno).toBe('Natančno izbijanje')
  })
})

describe('playersByDiscipline — združeno po tipu discipline', () => {
  const stats: PlayerSeasonStat[] = [
    { playerId: 'pA', totalPlayed: 4, totalMatchPointsFor: 6, totalScoreFor: 58, byDiscipline: [
      { disciplineId: 'd3', disciplineName: 'DVOJKA 1', disciplineType: 'dvojka', blockNumber: 1, played: 1, matchPointsFor: 2, scoreFor: 10, scoreAgainst: 8 },
      { disciplineId: 'd4', disciplineName: 'DVOJKA 2', disciplineType: 'dvojka', blockNumber: 1, played: 1, matchPointsFor: 0, scoreFor: 8, scoreAgainst: 9 },
      { disciplineId: 'd2', disciplineName: 'HITROSTNO', disciplineType: 'hitrostno', blockNumber: 3, played: 2, matchPointsFor: 4, scoreFor: 40, scoreAgainst: 20 },
    ] },
    { playerId: 'pB', totalPlayed: 1, totalMatchPointsFor: 0, totalScoreFor: 10, byDiscipline: [
      { disciplineId: 'd2', disciplineName: 'HITROSTNO', disciplineType: 'hitrostno', blockNumber: 3, played: 1, matchPointsFor: 0, scoreFor: 10, scoreAgainst: 20 },
    ] },
  ]

  test('obe instanci DVOJKA se združita v eno skupino', () => {
    const groups = playersByDiscipline(stats, discs)
    expect(groups.map(g => g.type)).toEqual(['posamezno', 'dvojka', 'hitrostno'])  // unikatni tipi v vrstnem redu
    const dvojka = groups.find(g => g.type === 'dvojka')!
    expect(dvojka.label).toBe('Dvojka')
    const pA = dvojka.rows.find(r => r.playerId === 'pA')!
    expect(pA.played).toBe(2)            // 1 + 1
    expect(pA.matchPointsFor).toBe(2)    // 2 + 0
    expect(pA.scoreFor).toBe(18)         // 10 + 8
    expect(pA.average).toBe(9)           // 18 / 2
  })

  test('razvrsti po točkah; prazna skupina nima vrstic', () => {
    const groups = playersByDiscipline(stats, discs)
    const hit = groups.find(g => g.type === 'hitrostno')!
    expect(hit.rows.map(r => r.playerId)).toEqual(['pA', 'pB'])
    expect(hit.rows[0].average).toBe(20)  // 40/2
    expect(groups.find(g => g.type === 'posamezno')!.rows).toHaveLength(0)
  })
})

describe('teamsByDiscipline — združeno po tipu discipline', () => {
  const fixtures: LeagueFixture[] = [
    { id: 'f1', season_id: 's', round_number: 1, home_team_id: 'tA', away_team_id: 'tB', home_score: null, away_score: null, status: 'completed', scheduled_date: null, chief_judge_id: null, judge_ids: [], group_label: null },
  ]
  const dr = (o: Partial<LeagueMatchDisciplineResult>): LeagueMatchDisciplineResult => ({
    id: 'x', match_result_id: 'mr1', discipline_id: 'd3', playground_number: null,
    home_score: 0, away_score: 0, home_match_points: 0, away_match_points: 0, home_players: [], away_players: [], ...o,
  })
  const mr: Array<LeagueMatchResult & { discipline_results?: LeagueMatchDisciplineResult[] }> = [
    { id: 'mr1', fixture_id: 'f1', judges: null, chief_judge: null, viewers: null, time_end: null, draw_natancno_field: null, draw_blok4: null, created_at: '', discipline_results: [
      dr({ id: 'r1', discipline_id: 'd3', home_score: 10, away_score: 8, home_match_points: 2, away_match_points: 0 }),
      dr({ id: 'r2', discipline_id: 'd4', home_score: 8, away_score: 6, home_match_points: 2, away_match_points: 0 }),
      dr({ id: 'r3', discipline_id: 'd2', home_score: 20, away_score: 15, home_match_points: 2, away_match_points: 0 }),
    ] },
  ]

  test('obe instanci DVOJKA se združita na ekipo', () => {
    const groups = teamsByDiscipline(['tA', 'tB'], fixtures, mr, discs)
    const dvojka = groups.find(g => g.type === 'dvojka')!
    const tA = dvojka.rows.find(r => r.teamId === 'tA')!
    expect(tA.played).toBe(2)         // d3 + d4
    expect(tA.matchPointsFor).toBe(4) // 2 + 2
    expect(tA.scoreFor).toBe(18)      // 10 + 8
    expect(tA.average).toBe(9)        // 18 / 2
    const tB = dvojka.rows.find(r => r.teamId === 'tB')!
    expect(tB.scoreFor).toBe(14)      // 8 + 6
    expect(tB.average).toBe(7)
  })
})
