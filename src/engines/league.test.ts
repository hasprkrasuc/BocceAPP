import { describe, it, expect } from 'vitest'
import { calculateStandings, generateRoundRobin } from './league'
import type { LeagueTeam, LeagueFixture, LeagueSeason } from '../types'

const makeSeason = (overrides?: Partial<LeagueSeason>): LeagueSeason => ({
  id: 's1', name: 'Test', year: 2025, category: 'men',
  status: 'active', tier: 'super_liga', obz_name: null, rounds_count: 1,
  win_points: 2, draw_points: 1, loss_points: 0,
  ...overrides,
})

const makeTeam = (id: string, name: string): LeagueTeam => ({
  id, season_id: 's1', club_name: name, short_name: null, captain_id: null,
})

const makeFixture = (
  id: string, homeId: string, awayId: string,
  homeScore: number | null, awayScore: number | null,
  completed = true,
): LeagueFixture => ({
  id, season_id: 's1', round_number: 1,
  home_team_id: homeId, away_team_id: awayId,
  home_score: homeScore, away_score: awayScore,
  status: completed ? 'completed' : 'scheduled',
  scheduled_date: null,
  chief_judge_id: null,
  judge_ids: [],
  group_label: null,
})

describe('calculateStandings', () => {
  it('ranks winner above loser', () => {
    const teams = [makeTeam('a', 'A'), makeTeam('b', 'B')]
    const fixtures = [makeFixture('f1', 'a', 'b', 11, 7)]
    const standings = calculateStandings(teams, fixtures, makeSeason())
    expect(standings[0].team.id).toBe('a')
    expect(standings[0].points).toBe(2)
    expect(standings[1].points).toBe(0)
  })

  it('awards draw points to both teams', () => {
    const teams = [makeTeam('a', 'A'), makeTeam('b', 'B')]
    const fixtures = [makeFixture('f1', 'a', 'b', 10, 10)]
    const standings = calculateStandings(teams, fixtures, makeSeason())
    expect(standings[0].points).toBe(1)
    expect(standings[1].points).toBe(1)
    expect(standings[0].drawn).toBe(1)
  })

  it('counts played, won, lost correctly', () => {
    const teams = [makeTeam('a', 'A'), makeTeam('b', 'B'), makeTeam('c', 'C')]
    const fixtures = [
      makeFixture('f1', 'a', 'b', 11, 7),
      makeFixture('f2', 'b', 'c', 7, 11),
    ]
    const standings = calculateStandings(teams, fixtures, makeSeason())
    const a = standings.find(s => s.team.id === 'a')!
    const b = standings.find(s => s.team.id === 'b')!
    expect(a.played).toBe(1)
    expect(a.won).toBe(1)
    expect(b.played).toBe(2)
    expect(b.won).toBe(0)
    expect(b.lost).toBe(2)
  })

  it('ignores non-completed fixtures', () => {
    const teams = [makeTeam('a', 'A'), makeTeam('b', 'B')]
    const fixtures = [makeFixture('f1', 'a', 'b', null, null, false)]
    const standings = calculateStandings(teams, fixtures, makeSeason())
    expect(standings.every(s => s.played === 0)).toBe(true)
  })

  it('accumulates points_for and points_against', () => {
    const teams = [makeTeam('a', 'A'), makeTeam('b', 'B')]
    const fixtures = [makeFixture('f1', 'a', 'b', 11, 7)]
    const standings = calculateStandings(teams, fixtures, makeSeason())
    const a = standings.find(s => s.team.id === 'a')!
    const b = standings.find(s => s.team.id === 'b')!
    expect(a.pointsFor).toBe(11)
    expect(a.pointsAgainst).toBe(7)
    expect(b.pointsFor).toBe(7)
    expect(b.pointsAgainst).toBe(11)
  })

  it('respects custom win/draw/loss points', () => {
    const teams = [makeTeam('a', 'A'), makeTeam('b', 'B')]
    const fixtures = [makeFixture('f1', 'a', 'b', 11, 7)]
    const standings = calculateStandings(teams, fixtures, makeSeason({ win_points: 3, loss_points: 1 }))
    const a = standings.find(s => s.team.id === 'a')!
    const b = standings.find(s => s.team.id === 'b')!
    expect(a.points).toBe(3)
    expect(b.points).toBe(1)
  })
})

describe('generateRoundRobin', () => {
  it('generates 6 fixtures for 4 teams single round', () => {
    const teams = [makeTeam('a','A'), makeTeam('b','B'), makeTeam('c','C'), makeTeam('d','D')]
    expect(generateRoundRobin(teams, false)).toHaveLength(6)
  })

  it('doubles fixture count for double round', () => {
    const teams = [makeTeam('a','A'), makeTeam('b','B'), makeTeam('c','C'), makeTeam('d','D')]
    const single = generateRoundRobin(teams, false)
    const double = generateRoundRobin(teams, true)
    expect(double).toHaveLength(single.length * 2)
  })

  it('reverses home/away in second half', () => {
    const teams = [makeTeam('a','A'), makeTeam('b','B')]
    const fixtures = generateRoundRobin(teams, true)
    expect(fixtures).toHaveLength(2)
    const [f1, f2] = fixtures
    expect(f1.home_team_id).toBe(f2.away_team_id)
    expect(f1.away_team_id).toBe(f2.home_team_id)
  })

  it('handles odd number of teams (adds BYE, excludes BYE matches)', () => {
    const teams = [makeTeam('a','A'), makeTeam('b','B'), makeTeam('c','C')]
    const fixtures = generateRoundRobin(teams, false)
    expect(fixtures.every(f => f.home_team_id !== 'BYE' && f.away_team_id !== 'BYE')).toBe(true)
    expect(fixtures).toHaveLength(3)
  })

  it('assigns sequential round numbers', () => {
    const teams = [makeTeam('a','A'), makeTeam('b','B'), makeTeam('c','C'), makeTeam('d','D')]
    const fixtures = generateRoundRobin(teams, false)
    const rounds = [...new Set(fixtures.map(f => f.round_number))].sort((a, b) => a - b)
    expect(rounds).toEqual([1, 2, 3])
  })
})
