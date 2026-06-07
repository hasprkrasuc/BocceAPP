import { describe, it, expect } from 'vitest'
import { buildGroupSchedule, applyScore, teamDisplayName } from './tournament'
import type { TournamentRegistration } from '../types'

describe('buildGroupSchedule', () => {
  it('creates 5 matches for a 3-team group', () => {
    const schedule = buildGroupSchedule(3, ['A', 'B', 'C'])
    expect(schedule).toHaveLength(5)
    expect(schedule[0].teamA).toBe('A')
    expect(schedule[0].teamB).toBe('B')
  })

  it('creates 5 matches for a 4-team group with no byes', () => {
    const schedule = buildGroupSchedule(4, ['A', 'B', 'C', 'D'])
    expect(schedule).toHaveLength(5)
    expect(schedule.filter(m => m.isBye)).toHaveLength(0)
  })

  it('creates 9 matches for a 5-team group', () => {
    const schedule = buildGroupSchedule(5, ['A', 'B', 'C', 'D', 'E'])
    expect(schedule).toHaveLength(9)
    expect(schedule.filter(m => m.isBye)).toHaveLength(2)
  })

  it('auto-plays bye matches with 6:0 score', () => {
    const schedule = buildGroupSchedule(3, ['A', 'B', 'C'])
    const byeMatch = schedule.find(m => m.isBye)!
    expect(byeMatch.played).toBe(true)
    expect(byeMatch.scoreA).toBe(6)
    expect(byeMatch.scoreB).toBe(0)
    expect(byeMatch.winner).toBe('C')
  })

  it('uses seeds correctly — match 1 is seed 0 vs seed 3 for 4 teams', () => {
    const teams = ['A', 'B', 'C', 'D']
    const schedule = buildGroupSchedule(4, teams)
    const m1 = schedule.find(m => m.num === 1)!
    expect(m1.teamA).toBe('A')
    expect(m1.teamB).toBe('D')
  })
})

describe('applyScore', () => {
  it('sets score and winner correctly', () => {
    const teams = ['A', 'B', 'C', 'D']
    const schedule = buildGroupSchedule(4, teams)
    const updated = applyScore(schedule, 1, 11, 7, teams)
    const m = updated.find(m => m.num === 1)!
    expect(m.scoreA).toBe(11)
    expect(m.scoreB).toBe(7)
    expect(m.winner).toBe('A')
    expect(m.loser).toBe('D')
    expect(m.played).toBe(true)
  })

  it('propagates winner to dependent match', () => {
    const teams = ['A', 'B', 'C', 'D']
    let schedule = buildGroupSchedule(4, teams)
    schedule = applyScore(schedule, 1, 11, 7, teams)
    schedule = applyScore(schedule, 2, 9, 11, teams)
    const m3 = schedule.find(m => m.num === 3)!
    expect(m3.teamA).toBe('A')  // winner of match 1
    expect(m3.teamB).toBe('C')  // winner of match 2
  })

  it('throws on tied score', () => {
    const teams = ['A', 'B', 'C', 'D']
    const schedule = buildGroupSchedule(4, teams)
    expect(() => applyScore(schedule, 1, 7, 7, teams)).toThrow()
  })

  it('throws for non-existent match number', () => {
    const schedule = buildGroupSchedule(4, ['A', 'B', 'C', 'D'])
    expect(() => applyScore(schedule, 99, 11, 7)).toThrow()
  })
})

describe('teamDisplayName', () => {
  it('returns last names of both players', () => {
    const reg = {
      player1: { full_name: 'Janez Novak' },
      player2: { full_name: 'Ana Kovač' },
    } as unknown as TournamentRegistration
    expect(teamDisplayName(reg)).toBe('Novak / Kovač')
  })

  it('returns ??? for null', () => {
    expect(teamDisplayName(null)).toBe('???')
  })

  it('returns ??? for undefined', () => {
    expect(teamDisplayName(undefined)).toBe('???')
  })

  it('handles single-word names gracefully', () => {
    const reg = {
      player1: { full_name: 'Janez' },
      player2: { full_name: 'Ana' },
    } as unknown as TournamentRegistration
    expect(teamDisplayName(reg)).toBe('Janez / Ana')
  })
})
