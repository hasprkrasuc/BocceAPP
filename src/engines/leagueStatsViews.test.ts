import { describe, test, expect } from 'vitest'
import { showsAverage, playersByDiscipline, teamsByDiscipline, AVERAGE_DISCIPLINES } from './leagueStatsViews'
import type { PlayerSeasonStat } from './leagueStats'
import type { LeagueFixture, LeagueMatchResult, LeagueMatchDisciplineResult, LeagueSeasonDiscipline } from '../types'

const discs: LeagueSeasonDiscipline[] = [
  { id: 'd1', season_id: 's', name: 'POSAMEZNO', discipline_type: 'posamezno', players_per_side: 1, has_reserve: false, block_number: 1, order_num: 1 },
  { id: 'd2', season_id: 's', name: 'HITROSTNO', discipline_type: 'hitrostno', players_per_side: 1, has_reserve: false, block_number: 3, order_num: 2 },
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

describe('playersByDiscipline', () => {
  const stats: PlayerSeasonStat[] = [
    { playerId: 'pA', totalPlayed: 2, totalMatchPointsFor: 4, totalScoreFor: 40, byDiscipline: [
      { disciplineId: 'd2', disciplineName: 'HITROSTNO', disciplineType: 'hitrostno', blockNumber: 3, played: 2, matchPointsFor: 4, scoreFor: 40, scoreAgainst: 20 },
    ] },
    { playerId: 'pB', totalPlayed: 1, totalMatchPointsFor: 0, totalScoreFor: 10, byDiscipline: [
      { disciplineId: 'd2', disciplineName: 'HITROSTNO', disciplineType: 'hitrostno', blockNumber: 3, played: 1, matchPointsFor: 0, scoreFor: 10, scoreAgainst: 20 },
    ] },
  ]
  test('grupira po disciplini, računa povprečje, razvrsti po točkah', () => {
    const sec = playersByDiscipline(stats, discs)
    const d2 = sec.find(s => s.discipline.id === 'd2')!
    expect(d2.rows.map(r => r.playerId)).toEqual(['pA', 'pB'])  // pA več točk
    expect(d2.rows[0].average).toBe(20)  // 40/2
    expect(d2.rows[1].average).toBe(10)  // 10/1
    // disciplina brez igralcev ima prazne vrstice
    expect(sec.find(s => s.discipline.id === 'd1')!.rows).toHaveLength(0)
  })
})

describe('teamsByDiscipline', () => {
  const fixtures: LeagueFixture[] = [
    { id: 'f1', season_id: 's', round_number: 1, home_team_id: 'tA', away_team_id: 'tB', home_score: null, away_score: null, status: 'completed', scheduled_date: null, chief_judge_id: null, judge_ids: [], group_label: null },
  ]
  const mr: Array<LeagueMatchResult & { discipline_results?: LeagueMatchDisciplineResult[] }> = [
    { id: 'mr1', fixture_id: 'f1', judges: null, chief_judge: null, viewers: null, time_end: null, draw_natancno_field: null, draw_blok4: null, created_at: '', discipline_results: [
      { id: 'dr2', match_result_id: 'mr1', discipline_id: 'd2', playground_number: null, home_score: 20, away_score: 15, home_match_points: 2, away_match_points: 0, home_players: ['pA'], away_players: ['pB'] },
    ] },
  ]
  test('pivotira po disciplini čez ekipe + povprečje', () => {
    const sec = teamsByDiscipline(['tA', 'tB'], fixtures, mr, discs)
    const d2 = sec.find(s => s.discipline.id === 'd2')!
    expect(d2.rows.map(r => r.teamId)).toEqual(['tA', 'tB'])  // tA več točk
    expect(d2.rows[0]).toMatchObject({ teamId: 'tA', played: 1, matchPointsFor: 2, scoreFor: 20, average: 20 })
    expect(d2.rows[1]).toMatchObject({ teamId: 'tB', matchPointsFor: 0, scoreFor: 15, average: 15 })
  })
})
