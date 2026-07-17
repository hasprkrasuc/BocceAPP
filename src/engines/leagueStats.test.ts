import { describe, test, expect } from 'vitest'
import { aggregatePlayerStats, aggregateTeamDisciplineStats, calculateRang, stripReserve, isReserve } from './leagueStats'
import type { LeagueFixture, LeagueMatchResult, LeagueMatchDisciplineResult, LeagueSeasonDiscipline } from '../types'

const disciplines: LeagueSeasonDiscipline[] = [
  { id: 'd1', season_id: 's', name: 'POSAMEZNO', discipline_type: 'posamezno', players_per_side: 1, has_reserve: false, block_number: 1, order_num: 1 },
  { id: 'd2', season_id: 's', name: 'HITROSTNO', discipline_type: 'hitrostno', players_per_side: 1, has_reserve: false, block_number: 3, order_num: 2 },
]
const fixtures: LeagueFixture[] = [
  { id: 'f1', season_id: 's', round_number: 1, home_team_id: 'tA', away_team_id: 'tB', home_score: null, away_score: null, status: 'completed', scheduled_date: null, chief_judge_id: null, judge_ids: [], group_label: null },
  { id: 'f2', season_id: 's', round_number: 2, home_team_id: 'tA', away_team_id: 'tB', home_score: null, away_score: null, status: 'scheduled', scheduled_date: null, chief_judge_id: null, judge_ids: [], group_label: null },
]
const dr = (over: Partial<LeagueMatchDisciplineResult>): LeagueMatchDisciplineResult => ({
  id: 'x', match_result_id: 'mr1', discipline_id: 'd1', playground_number: null,
  home_score: 0, away_score: 0, home_match_points: 0, away_match_points: 0,
  home_players: [], away_players: [], ...over,
})
const matchResults: Array<LeagueMatchResult & { discipline_results?: LeagueMatchDisciplineResult[] }> = [
  { id: 'mr1', fixture_id: 'f1', judges: null, chief_judge: null, viewers: null, time_end: null, draw_natancno_field: null, draw_blok4: null, created_at: '', discipline_results: [
    dr({ id: 'dr1', discipline_id: 'd1', home_score: 12, away_score: 8, home_match_points: 2, away_match_points: 0, home_players: ['pA'], away_players: ['pB'] }),
    dr({ id: 'dr2', discipline_id: 'd2', home_score: 20, away_score: 15, home_match_points: 2, away_match_points: 0, home_players: ['pA'], away_players: ['R: Rez Erva'] }),
  ] },
]

describe('aggregatePlayerStats', () => {
  test('sešteje točke in koše po igralcu in disciplini; rezerva (menjava) šteje kot nastop', () => {
    const ps = aggregatePlayerStats(matchResults, fixtures, disciplines)
    const pA = ps.find(p => p.playerId === 'pA')!
    expect(pA.totalPlayed).toBe(2)
    expect(pA.totalMatchPointsFor).toBe(4)
    const hit = pA.byDiscipline.find(d => d.disciplineId === 'd2')!
    expect(hit.played).toBe(1)
    expect(hit.scoreFor).toBe(20)

    // rezerva "R: Rez Erva" je vstopila kot menjava v d2 (away) -> šteje kot nastop
    // pod svojo golo (stripped) identiteto, ne kot "R: ..." vnos.
    expect(ps.find(p => p.playerId.startsWith('R:'))).toBeUndefined()
    const rez = ps.find(p => p.playerId === 'Rez Erva')!
    expect(rez).toBeDefined()
    expect(rez.totalPlayed).toBe(1)
    expect(rez.totalMatchPointsFor).toBe(0)
    const rezHit = rez.byDiscipline.find(d => d.disciplineId === 'd2')!
    expect(rezHit.played).toBe(1)
    expect(rezHit.scoreFor).toBe(15)
    expect(rezHit.scoreAgainst).toBe(20)
  })

  test('rezerva vpisana kot "R: <uuid>" se združi z ostalimi nastopi istega igralca', () => {
    // pB nastopi normalno v d1 (away_players: ['pB']), nato kot rezerva v d2 (away_players: ['R: pB'])
    const withReserveUuid: Array<LeagueMatchResult & { discipline_results?: LeagueMatchDisciplineResult[] }> = [
      { id: 'mr1', fixture_id: 'f1', judges: null, chief_judge: null, viewers: null, time_end: null, draw_natancno_field: null, draw_blok4: null, created_at: '', discipline_results: [
        dr({ id: 'dr1', discipline_id: 'd1', home_score: 12, away_score: 8, home_match_points: 2, away_match_points: 0, home_players: ['pA'], away_players: ['pB'] }),
        dr({ id: 'dr2', discipline_id: 'd2', home_score: 20, away_score: 15, home_match_points: 2, away_match_points: 0, home_players: ['pA'], away_players: ['R: pB'] }),
      ] },
    ]
    const ps = aggregatePlayerStats(withReserveUuid, fixtures, disciplines)
    // ni ločenega vnosa "R: pB" -- vse se združi pod "pB"
    expect(ps.find(p => p.playerId.startsWith('R:'))).toBeUndefined()
    const pB = ps.find(p => p.playerId === 'pB')!
    expect(pB).toBeDefined()
    expect(pB.totalPlayed).toBe(2)
    expect(pB.byDiscipline.find(d => d.disciplineId === 'd1')!.played).toBe(1)
    expect(pB.byDiscipline.find(d => d.disciplineId === 'd2')!.played).toBe(1)
  })

  test('upošteva samo zaključene tekme', () => {
    const onlyScheduled = aggregatePlayerStats(
      [{ ...matchResults[0], fixture_id: 'f2' }], fixtures, disciplines,
    )
    expect(onlyScheduled).toHaveLength(0)
  })
})

describe('stripReserve / isReserve', () => {
  test('stripReserve odstrani "R: " predpono, isReserve jo zazna', () => {
    expect(stripReserve('R: Rez Erva')).toBe('Rez Erva')
    expect(stripReserve('pB')).toBe('pB')
    expect(isReserve('R: pB')).toBe(true)
    expect(isReserve('pB')).toBe(false)
  })
})

describe('aggregateTeamDisciplineStats', () => {
  test('na ekipo sešteje po disciplini točke in koš', () => {
    const tA = aggregateTeamDisciplineStats('tA', fixtures, matchResults, disciplines)
    const d2 = tA.find(d => d.disciplineId === 'd2')!
    expect(d2.played).toBe(1)
    expect(d2.matchPointsFor).toBe(2)
    expect(d2.scoreFor).toBe(20)
    expect(d2.scoreAgainst).toBe(15)
  })

  test('za gostujočo ekipo zamenja stran (for/against)', () => {
    const tB = aggregateTeamDisciplineStats('tB', fixtures, matchResults, disciplines)
    const d1 = tB.find(d => d.disciplineId === 'd1')!
    expect(d1.matchPointsFor).toBe(0)
    expect(d1.scoreFor).toBe(8)
    expect(d1.scoreAgainst).toBe(12)
  })
})

describe('calculateRang', () => {
  test('vrne rang > 0 za igralca z osvojenimi točkami', () => {
    const ps = aggregatePlayerStats(matchResults, fixtures, disciplines)
    const pA = ps.find(p => p.playerId === 'pA')!
    const r = calculateRang(pA, 'super_liga')
    expect(r.playerId).toBe('pA')
    expect(r.rang).toBeGreaterThan(0)
    expect(r.totalMatchPointsFor).toBe(4)
  })
})
