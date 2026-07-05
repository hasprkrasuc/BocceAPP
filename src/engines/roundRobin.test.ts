import { describe, test, expect } from 'vitest'
import { roundRobinStandings, type RRMatch } from './roundRobin'

const m = (a: string, b: string, sa: number, sb: number): RRMatch =>
  ({ team_a_id: a, team_b_id: b, score_a: sa, score_b: sb, is_bye: false })

describe('roundRobinStandings — Berger liga (zmaga 2, remi 1, poraz 0)', () => {
  test('preprost krog treh: A>B, B>C, A>C', () => {
    const rows = [m('A', 'B', 13, 7), m('B', 'C', 10, 8), m('A', 'C', 12, 5)]
    const s = roundRobinStandings(rows)
    expect(s.map(r => r.teamId)).toEqual(['A', 'B', 'C'])
    expect(s[0]).toMatchObject({ teamId: 'A', played: 2, wins: 2, draws: 0, losses: 0, points: 4 })
    expect(s[1]).toMatchObject({ teamId: 'B', wins: 1, losses: 1, points: 2 })
    expect(s[2]).toMatchObject({ teamId: 'C', wins: 0, losses: 2, points: 0 })
  })

  test('remi da obema 1 točko', () => {
    const s = roundRobinStandings([m('A', 'B', 9, 9)])
    expect(s.find(r => r.teamId === 'A')).toMatchObject({ draws: 1, points: 1 })
    expect(s.find(r => r.teamId === 'B')).toMatchObject({ draws: 1, points: 1 })
  })

  test('prosti (bye) in nedokončane tekme se preskočijo', () => {
    const rows: RRMatch[] = [
      { team_a_id: 'A', team_b_id: null, score_a: 6, score_b: 0, is_bye: true },
      { team_a_id: 'A', team_b_id: 'B', score_a: null, score_b: null, is_bye: false },
      m('A', 'B', 10, 5),
    ]
    const s = roundRobinStandings(rows)
    expect(s.find(r => r.teamId === 'A')).toMatchObject({ played: 1, wins: 1, points: 2 })
  })

  test('vrstni red: točke, nato razlika, nato doseženi', () => {
    // A in B po 2 točki; A ima boljšo razliko
    const rows = [m('A', 'C', 13, 2), m('B', 'C', 10, 8), m('A', 'B', 5, 12)]
    const s = roundRobinStandings(rows)
    // A: 1 zmaga (nad C, +11) 1 poraz = 2t, razlika (13+5)-(2+12)=+4
    // B: 1 zmaga (nad C, +2) 1 zmaga (nad A) = 4t
    expect(s[0].teamId).toBe('B') // 4 točke
    expect(s[1].teamId).toBe('A') // 2 točki, boljša razlika kot C
    expect(s[2].teamId).toBe('C')
  })
})
