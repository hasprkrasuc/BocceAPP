import { describe, it, expect } from 'vitest'
import {
  buildGroupSchedule, applyScore, teamDisplayName, suggestGroupDistribution,
  computePropagation, GROUP_TEMPLATES, type PropagationRow,
} from './tournament'
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

describe('computePropagation', () => {
  // 3-team template:
  //  1: zm seed0 vs seed1        4: po losesMatch1 vs BYE
  //  2: bye seed2 vs BYE         5: r  losesMatch3 vs winsMatch4
  //  3: zm winsMatch1 vs winsMatch2
  const template3 = GROUP_TEMPLATES[3]

  it('regression: returns an EMPTY list once everything is already propagated (no infinite loop)', () => {
    const rows: PropagationRow[] = [
      { match_number: 1, status: 'completed', is_bye: false, team_a_id: 't1', team_b_id: 't2', winner_id: 't1' },
      { match_number: 2, status: 'completed', is_bye: true,  team_a_id: 't3', team_b_id: null, winner_id: 't3' },
      { match_number: 3, status: 'pending',   is_bye: false, team_a_id: 't1', team_b_id: 't3', winner_id: null },
      { match_number: 4, status: 'completed', is_bye: true,  team_a_id: 't2', team_b_id: null, winner_id: 't2' },
      { match_number: 5, status: 'pending',   is_bye: false, team_a_id: null, team_b_id: 't2', winner_id: null },
    ]

    const first = computePropagation(rows, template3)
    expect(first).toEqual([])

    // Running it again on the same (unchanged) state must also be empty —
    // this is what the old "always assign" code got wrong: it kept
    // rewriting the same values forever because `changed` never went false.
    const second = computePropagation(rows, template3)
    expect(second).toEqual([])
  })

  it('propagates match #1 into pending match #3 and bye match #4 when they are not yet resolved', () => {
    const rows: PropagationRow[] = [
      { match_number: 1, status: 'completed', is_bye: false, team_a_id: 't1', team_b_id: 't2', winner_id: 't1' },
      { match_number: 2, status: 'completed', is_bye: true,  team_a_id: 't3', team_b_id: null, winner_id: 't3' },
      { match_number: 3, status: 'pending',   is_bye: false, team_a_id: null, team_b_id: null, winner_id: null },
      { match_number: 4, status: 'completed', is_bye: true,  team_a_id: null, team_b_id: null, winner_id: null },
      { match_number: 5, status: 'pending',   is_bye: false, team_a_id: null, team_b_id: null, winner_id: null },
    ]

    const result = computePropagation(rows, template3)

    const m3 = result.find(u => u.match_number === 3)
    expect(m3?.updates).toEqual({ team_a_id: 't1', team_b_id: 't3' })

    const m4 = result.find(u => u.match_number === 4)
    expect(m4?.updates).toEqual({ team_a_id: 't2', winner_id: 't2' })
  })

  it('sets a bye match winner once, and not again on a second pass', () => {
    const rows: PropagationRow[] = [
      { match_number: 1, status: 'completed', is_bye: false, team_a_id: 't1', team_b_id: 't2', winner_id: 't1' },
      { match_number: 2, status: 'completed', is_bye: true,  team_a_id: 't3', team_b_id: null, winner_id: 't3' },
      { match_number: 3, status: 'pending',   is_bye: false, team_a_id: null, team_b_id: null, winner_id: null },
      { match_number: 4, status: 'completed', is_bye: true,  team_a_id: null, team_b_id: null, winner_id: null },
      { match_number: 5, status: 'pending',   is_bye: false, team_a_id: null, team_b_id: null, winner_id: null },
    ]

    const first = computePropagation(rows, template3)
    const m4Update = first.find(u => u.match_number === 4)
    expect(m4Update?.updates.winner_id).toBe('t2')

    // Apply the update exactly like propagateGroup does, then re-run.
    const m4 = rows.find(r => r.match_number === 4)!
    Object.assign(m4, m4Update!.updates)

    const second = computePropagation(rows, template3)
    expect(second.find(u => u.match_number === 4)).toBeUndefined()
  })

  it('leaves a completed non-bye match untouched even when a template entry exists for it', () => {
    const rows: PropagationRow[] = [
      { match_number: 1, status: 'completed', is_bye: false, team_a_id: 't1', team_b_id: 't2', winner_id: 't1' },
    ]
    const result = computePropagation(rows, GROUP_TEMPLATES[4])
    expect(result).toEqual([])
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

  it('expanded: registrirana igralca → "Priimek I."', () => {
    const reg = {
      player1: { full_name: 'Janez Novak' },
      player2: { full_name: 'Ana Kovač' },
    } as unknown as TournamentRegistration
    expect(teamDisplayName(reg, true)).toBe('Novak J. / Kovač A.')
  })

  it('expanded: tuji igralec z dvema besedama → izpiše oboje (zadnji dve = priimek)', () => {
    const reg = {
      guest1: { full_name: 'Niko Buterin' },
      player2_guest_id: 'x',
      guest2: { full_name: 'Fernando Mrak' },
    } as unknown as TournamentRegistration
    expect(teamDisplayName(reg, true)).toBe('Niko Buterin / Fernando Mrak')
  })

  it('expanded: tuji igralec s tremi besedami → zadnji dve = priimek + začetnica', () => {
    const reg = {
      guest1: { full_name: 'Ivano Rajačić Muža' },
    } as unknown as TournamentRegistration
    expect(teamDisplayName(reg, true)).toBe('Rajačić Muža I.')
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

  // Regression tests for the "? / ?" score-modal bug: a registration of two
  // REGISTERED USERS must resolve names either from the nested player1/player2
  // objects or (documented failure mode below) fall back to '?' when those
  // nested objects are missing from the query embed.

  it('resolves registered-user pair from nested player1/player2', () => {
    const reg = {
      player1_id: 't1', player2_id: 't2',
      player1: { full_name: 'Janez Novak' },
      player2: { full_name: 'Miha Kovač' },
    } as unknown as TournamentRegistration
    expect(teamDisplayName(reg)).toBe('Novak / Kovač')
  })

  it('documents the "? / ?" failure mode: ids present but no nested objects and no free-text name', () => {
    const reg = {
      player1_id: 't1', player2_id: 't2',
      // No nested player1/player2 (query didn't embed them) and no player1_name/player2_name.
    } as unknown as TournamentRegistration
    expect(teamDisplayName(reg)).toBe('? / ?')
  })

  it('resolves guest free-text names', () => {
    const reg = {
      player1_name: 'Novak', player2_name: 'Kovač',
    } as unknown as TournamentRegistration
    expect(teamDisplayName(reg)).toBe('Novak / Kovač')
  })

  it('resolves nested guest1/guest2 objects', () => {
    const reg = {
      player1_guest_id: 'g1', player2_guest_id: 'g2',
      guest1: { full_name: 'Janez Novak' },
      guest2: { full_name: 'Miha Kovač' },
    } as unknown as TournamentRegistration
    expect(teamDisplayName(reg)).toBe('Novak / Kovač')
  })

  it('returns ??? for a null registration (undecided slot)', () => {
    expect(teamDisplayName(null)).toBe('???')
  })

  it('returns just one surname for a single-player registration', () => {
    const reg = {
      player1_id: 't1',
      player1: { full_name: 'Janez Novak' },
      player2_id: null, player2_guest_id: null, player2_name: null,
    } as unknown as TournamentRegistration
    expect(teamDisplayName(reg)).toBe('Novak')
  })
})
