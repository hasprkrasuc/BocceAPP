import { describe, it, expect } from 'vitest'
import { calculateStandings } from './league'
import type { LeagueTeam, LeagueFixture, LeagueSeason, LeagueMatchResult, LeagueMatchDisciplineResult } from '../types'

const makeSeason = (overrides?: Partial<LeagueSeason>): LeagueSeason => ({
  id: 's1', name: 'Test', year: 2025, category: 'men',
  status: 'active', tier: 'super_liga', obz_name: null, rounds_count: 99,
  win_points: 2, draw_points: 1, loss_points: 0,
  ...overrides,
})

const makeTeam = (id: string, name: string): LeagueTeam => ({
  id, season_id: 's1', club_name: name, short_name: null, captain_id: null,
})

const makeFixture = (
  id: string, homeId: string, awayId: string,
  homeScore: number | null, awayScore: number | null,
  completed = true, round = 1,
): LeagueFixture => ({
  id, season_id: 's1', round_number: round,
  home_team_id: homeId, away_team_id: awayId,
  home_score: homeScore, away_score: awayScore,
  status: completed ? 'completed' : 'scheduled',
  scheduled_date: null, chief_judge_id: null, judge_ids: [], group_label: null,
})

/** Match-result z eno disciplinsko vrstico, ki nosi seštevek boule točk (za tiebreak testiranje). */
const makeResult = (fixtureId: string, homeBoules: number, awayBoules: number): LeagueMatchResult & { discipline_results: LeagueMatchDisciplineResult[] } => ({
  id: 'r_' + fixtureId, fixture_id: fixtureId,
  discipline_results: [{
    id: 'd_' + fixtureId, match_result_id: 'r_' + fixtureId, discipline_id: 'x',
    playground_number: null, home_score: homeBoules, away_score: awayBoules,
    home_match_points: 0, away_match_points: 0, home_players: [], away_players: [],
  }] as unknown as LeagueMatchDisciplineResult[],
} as unknown as LeagueMatchResult & { discipline_results: LeagueMatchDisciplineResult[] })

describe('calculateStandings — uvrstitev po seštevku match točk', () => {
  it('rangira po pointsFor (osvojene match točke), ne po zmagah', () => {
    const teams = [makeTeam('a', 'A'), makeTeam('b', 'B'), makeTeam('c', 'C')]
    // A: 1 zmaga a visok izid; B: 2 zmagi a nizka izida -> A ima več match točk
    const fixtures = [
      makeFixture('f1', 'a', 'c', 22, 2),  // A +22
      makeFixture('f2', 'b', 'c', 13, 11), // B +13
      makeFixture('f3', 'b', 'a', 6, 18),  // B +6, A +18  => A=40, B=19
    ]
    const s = calculateStandings(teams, fixtures, makeSeason())
    expect(s[0].team.id).toBe('a')
    expect(s[0].points).toBe(40)     // points == pointsFor
    expect(s[0].won).toBe(2)
  })

  it('kriterij 2: medsebojni dvoboji ob enakem seštevku match točk', () => {
    const teams = [makeTeam('a', 'A'), makeTeam('b', 'B'), makeTeam('c', 'C')]
    const fixtures = [
      makeFixture('f1', 'a', 'b', 10, 14), // A10 B14
      makeFixture('f2', 'b', 'a', 11, 13), // B11 A13  => H2H: A23 B25
      makeFixture('f3', 'a', 'c', 22, 2),  // A+22
      makeFixture('f4', 'b', 'c', 20, 4),  // B+20  => total A=45, B=45 (izenačeno)
    ]
    const s = calculateStandings(teams, fixtures, makeSeason())
    expect(s[0].pointsFor).toBe(45)
    expect(s[1].pointsFor).toBe(45)
    expect(s[0].team.id).toBe('b') // B višje po medsebojnih (25 > 23)
    expect(s[1].team.id).toBe('a')
  })

  it('kriterij 3: razlika boule točk v medsebojnih ob izenačenih match točkah in medsebojnih', () => {
    const teams = [makeTeam('a', 'A'), makeTeam('b', 'B')]
    const fixtures = [
      makeFixture('f1', 'a', 'b', 12, 12), // match točke izenačene
      makeFixture('f2', 'b', 'a', 12, 12),
    ]
    // boule: f1 A169:B175 ; f2 B157:A146  => A=315, B=332 -> B višje
    const results = [makeResult('f1', 169, 175), makeResult('f2', 157, 146)]
    const s = calculateStandings(teams, fixtures, makeSeason(), results)
    expect(s[0].pointsFor).toBe(24)
    expect(s[1].pointsFor).toBe(24)
    expect(s[0].team.id).toBe('b') // B: boule razlika +17
    expect(s[0].boulesFor).toBe(332)
  })

  it('šteje odigrane, zmage, poraze; ignorira neodigrane', () => {
    const teams = [makeTeam('a', 'A'), makeTeam('b', 'B')]
    const fixtures = [makeFixture('f1', 'a', 'b', 11, 7), makeFixture('f2', 'a', 'b', null, null, false)]
    const s = calculateStandings(teams, fixtures, makeSeason())
    const a = s.find(x => x.team.id === 'a')!
    expect(a.played).toBe(1); expect(a.won).toBe(1)
    expect(a.pointsFor).toBe(11); expect(a.pointsAgainst).toBe(7)
  })

  it('izloči tekme končnice (round_number > rounds_count)', () => {
    const teams = [makeTeam('a', 'A'), makeTeam('b', 'B')]
    const fixtures = [
      makeFixture('f1', 'a', 'b', 10, 8, true, 1),   // redni del
      makeFixture('f2', 'a', 'b', 2, 20, true, 5),   // končnica — se NE šteje
    ]
    const s = calculateStandings(teams, fixtures, makeSeason({ rounds_count: 1 }))
    const a = s.find(x => x.team.id === 'a')!
    expect(a.played).toBe(1)
    expect(a.pointsFor).toBe(10)
  })
})
