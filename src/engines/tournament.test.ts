import { describe, it, expect } from 'vitest'
import { buildGroupSchedule, applyScore, teamDisplayName, suggestGroupDistribution } from './tournament'
import type { TournamentRegistration } from '../types'

describe('suggestGroupDistribution', () => {
  const sizesSum = (d: ReturnType<typeof suggestGroupDistribution>) =>
    d.groups3 * 3 + d.groups4 * 4 + d.groups5 * 5

  it('spreads 26 teams into 8 groups as 2×4 + 6×3 (no extra round), all valid', () => {
    const d = suggestGroupDistribution(26, 8)
    expect(d.isValid).toBe(true)
    expect(d.groups3 + d.groups4 + d.groups5).toBe(8)
    expect(d.groups5).toBe(0)
    expect(d.groups4).toBe(2)
    expect(d.groups3).toBe(6)
    expect(sizesSum(d)).toBe(26)
    expect(d.extraStage).toBeNull()       // power of 2 → no extra round
    expect(d.groups3).toBeGreaterThan(0)  // groups of 3 are allowed and direct
  })

  it('never produces negative group counts (no "Invalid array length")', () => {
    for (let n = 4; n <= 60; n++) {
      const d = suggestGroupDistribution(n)
      expect(d.groups3).toBeGreaterThanOrEqual(0)
      expect(d.groups4).toBeGreaterThanOrEqual(0)
      expect(d.groups5).toBeGreaterThanOrEqual(0)
      if (d.isValid) expect(sizesSum(d)).toBe(n)
    }
  })

  it('exact fits stay as full groups of 4 / 5', () => {
    const d32 = suggestGroupDistribution(32, 8)
    expect(d32.isValid).toBe(true)
    expect(d32.groups4).toBe(8)
    const d40 = suggestGroupDistribution(40, 8)
    expect(d40.isValid).toBe(true)
    expect(d40.groups5).toBe(8)
  })

  it('marks impossible counts invalid instead of crashing (too few teams for the groups)', () => {
    const d = suggestGroupDistribution(10, 8) // needs 24–40 for 8 groups
    expect(d.isValid).toBe(false)
  })
})

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
