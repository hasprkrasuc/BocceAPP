import { describe, test, expect } from 'vitest'
import { championshipPoints, type ChampKoMatch } from './championshipPoints'

// group_team id -> igralci (dvojica = 2 igralca)
const players = { A: ['a'], B: ['b'], C: ['c'], D: ['d'], E: ['e'], F: ['f'], G: ['g'], H: ['h'] }

describe('championshipPoints — DP točke po uvrstitvi', () => {
  test('finale: zmagovalec 16 (1.), poraženec 10 (2.)', () => {
    const m: ChampKoMatch[] = [{ stage: 'final', winnerId: 'A', teamAId: 'A', teamBId: 'B' }]
    const res = championshipPoints(m, players)
    expect(res.find(r => r.playerId === 'a')).toMatchObject({ pts: 16 })
    expect(res.find(r => r.playerId === 'b')).toMatchObject({ pts: 10 })
  })

  test('tekma za 3. mesto: 8 in 7', () => {
    const m: ChampKoMatch[] = [{ stage: 'third_place', winnerId: 'C', teamAId: 'C', teamBId: 'D' }]
    const res = championshipPoints(m, players)
    expect(res.find(r => r.playerId === 'c')?.pts).toBe(8)
    expect(res.find(r => r.playerId === 'd')?.pts).toBe(7)
  })

  test('polfinale BREZ tekme za 3. mesto: oba poraženca deljeni bron (8+8)', () => {
    const m: ChampKoMatch[] = [
      { stage: 'sf', winnerId: 'A', teamAId: 'A', teamBId: 'C' },
      { stage: 'sf', winnerId: 'B', teamAId: 'B', teamBId: 'D' },
      { stage: 'final', winnerId: 'A', teamAId: 'A', teamBId: 'B' },
    ]
    const res = championshipPoints(m, players)
    expect(res.find(r => r.playerId === 'c')?.pts).toBe(8)  // polf. poraženec
    expect(res.find(r => r.playerId === 'd')?.pts).toBe(8)  // polf. poraženec
    expect(res.find(r => r.playerId === 'a')?.pts).toBe(16) // prvak
    expect(res.find(r => r.playerId === 'b')?.pts).toBe(10) // finalist
  })

  test('polfinale Z tekmo za 3. mesto: sf ne podeli nič, tekma za 3. mesto pa 8/7', () => {
    const m: ChampKoMatch[] = [
      { stage: 'sf', winnerId: 'A', teamAId: 'A', teamBId: 'C' },
      { stage: 'sf', winnerId: 'B', teamAId: 'B', teamBId: 'D' },
      { stage: 'third_place', winnerId: 'C', teamAId: 'C', teamBId: 'D' },
      { stage: 'final', winnerId: 'A', teamAId: 'A', teamBId: 'B' },
    ]
    const res = championshipPoints(m, players)
    expect(res.find(r => r.playerId === 'c')?.pts).toBe(8)  // zmagal za 3. mesto
    expect(res.find(r => r.playerId === 'd')?.pts).toBe(7)  // izgubil za 3. mesto
    // c/d se NE podvojita (sf jima ne doda ničesar, ko obstaja third_place)
    expect(res.filter(r => r.playerId === 'c')).toHaveLength(1)
  })

  test('četrtfinale: poraženci 3 (5.–8.); osmina: poraženci 1 (9.–16.)', () => {
    const m: ChampKoMatch[] = [
      { stage: 'qf', winnerId: 'A', teamAId: 'A', teamBId: 'B' },
      { stage: 'r16', winnerId: 'C', teamAId: 'C', teamBId: 'D' },
    ]
    const res = championshipPoints(m, players)
    expect(res.find(r => r.playerId === 'b')?.pts).toBe(3)  // qf poraženec
    expect(res.find(r => r.playerId === 'd')?.pts).toBe(1)  // r16 poraženec
  })

  test('dvojica: oba igralca ekipe dobita točke', () => {
    const pairPlayers = { A: ['a1', 'a2'], B: ['b1', 'b2'] }
    const m: ChampKoMatch[] = [{ stage: 'final', winnerId: 'A', teamAId: 'A', teamBId: 'B' }]
    const res = championshipPoints(m, pairPlayers)
    expect(res.filter(r => r.pts === 16).map(r => r.playerId).sort()).toEqual(['a1', 'a2'])
    expect(res.filter(r => r.pts === 10).map(r => r.playerId).sort()).toEqual(['b1', 'b2'])
  })

  test('tekma brez zmagovalca (winnerId null) se preskoči', () => {
    const m: ChampKoMatch[] = [{ stage: 'final', winnerId: null, teamAId: 'A', teamBId: 'B' }]
    expect(championshipPoints(m, players)).toEqual([])
  })
})
