import { describe, test, expect } from 'vitest'
import { bracketSize, seedOrder, firstStageForSize } from './knockout'
import { buildKnockoutBracket, buildBracketFromFirstRound } from './knockout'
import { knockoutPropagation, type KoMatchRow } from './knockout'
import { seedRegistrations, type SeedableReg } from './knockout'

describe('buildBracketFromFirstRound', () => {
  test('8 parov (16 ekip) → r16(8)+qf(4)+sf(2)+final(1)+3.mesto; vsaka ekipa enkrat', () => {
    const teams = Array.from({ length: 16 }, (_, i) => `t${i + 1}`)
    const pairs: Array<[string | null, string | null]> = []
    for (let i = 0; i < 8; i++) pairs.push([teams[2 * i], teams[2 * i + 1]])
    const m = buildBracketFromFirstRound(pairs)
    const count = (s: string) => m.filter(x => x.stage === s).length
    expect(count('r16')).toBe(8)
    expect(count('qf')).toBe(4)
    expect(count('sf')).toBe(2)
    expect(count('final')).toBe(1)
    expect(count('third_place')).toBe(1)
    // Prvi krog vsebuje vseh 16 ekip natanko enkrat (brez podvajanja — regresija)
    const r16 = m.filter(x => x.stage === 'r16')
    const used = r16.flatMap(x => [x.teamA, x.teamB]).filter(Boolean)
    expect(used).toHaveLength(16)
    expect(new Set(used).size).toBe(16)
  })

  test('lih par (bye) → tekma je označena kot bye z zmagovalcem', () => {
    const m = buildBracketFromFirstRound([['a', 'b'], ['c', null]])
    const byes = m.filter(x => x.isBye)
    expect(byes).toHaveLength(1)
    expect(byes[0].winner).toBe('c')
  })

  test('zavrne število parov, ki ne da potence 2', () => {
    expect(() => buildBracketFromFirstRound([['a', 'b'], ['c', 'd'], ['e', 'f']])).toThrow()
  })

  test('buildKnockoutBracket ostane skladen (16 nosilcev → r16 8 tekem)', () => {
    const teams = Array.from({ length: 16 }, (_, i) => `s${i + 1}`)
    const m = buildKnockoutBracket(teams)
    expect(m.filter(x => x.stage === 'r16')).toHaveLength(8)
    const used = m.filter(x => x.stage === 'r16').flatMap(x => [x.teamA, x.teamB]).filter(Boolean)
    expect(new Set(used).size).toBe(16)
  })
})

describe('bracketSize', () => {
  test('najbližja potenca 2 ≥ n', () => {
    expect(bracketSize(2)).toBe(2)
    expect(bracketSize(3)).toBe(4)
    expect(bracketSize(5)).toBe(8)
    expect(bracketSize(8)).toBe(8)
    expect(bracketSize(9)).toBe(16)
    expect(bracketSize(17)).toBe(32)
    expect(bracketSize(128)).toBe(128)
  })
  test('robni primeri vržejo napako', () => {
    expect(() => bracketSize(1)).toThrow()
    expect(() => bracketSize(129)).toThrow()
  })
})

describe('seedOrder', () => {
  test('standardni razpored', () => {
    expect(seedOrder(2)).toEqual([1, 2])
    expect(seedOrder(4)).toEqual([1, 4, 2, 3])
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
  })
  test('nosilca 1 in 2 v nasprotnih polovicah', () => {
    const o = seedOrder(16)
    expect(o).toHaveLength(16)
    expect(o.indexOf(1) < 8).toBe(true)
    expect(o.indexOf(2) >= 8).toBe(true)
  })
})

describe('firstStageForSize', () => {
  test('ime prvega kroga', () => {
    expect(firstStageForSize(2)).toBe('final')
    expect(firstStageForSize(4)).toBe('sf')
    expect(firstStageForSize(8)).toBe('qf')
    expect(firstStageForSize(16)).toBe('r16')
    expect(firstStageForSize(32)).toBe('r32')
    expect(firstStageForSize(64)).toBe('r64')
    expect(firstStageForSize(128)).toBe('r128')
  })
})

describe('buildKnockoutBracket', () => {
  test('N=4: 2 sf + finale + tekma za 3.', () => {
    const m = buildKnockoutBracket(['t1', 't2', 't3', 't4'])
    const sf = m.filter(x => x.stage === 'sf')
    expect(sf).toHaveLength(2)
    // nosilni razpored [1,4,2,3] -> pari (t1,t4),(t2,t3)
    expect(sf[0]).toMatchObject({ teamA: 't1', teamB: 't4', isBye: false })
    expect(sf[1]).toMatchObject({ teamA: 't2', teamB: 't3', isBye: false })
    expect(m.filter(x => x.stage === 'final')).toHaveLength(1)
    expect(m.filter(x => x.stage === 'third_place')).toHaveLength(1)
  })

  test('N=3: prosti (bye) najboljšemu nosilcu', () => {
    const m = buildKnockoutBracket(['t1', 't2', 't3'])
    const sf = m.filter(x => x.stage === 'sf').sort((a, b) => a.matchNumber - b.matchNumber)
    // sloti [t1, null, t2, t3] -> (t1,bye),(t2,t3)
    expect(sf[0]).toMatchObject({ teamA: 't1', teamB: null, isBye: true, winner: 't1' })
    expect(sf[1]).toMatchObject({ teamA: 't2', teamB: 't3', isBye: false })
  })

  test('N=2: samo finale, brez tekme za 3.', () => {
    const m = buildKnockoutBracket(['t1', 't2'])
    expect(m).toHaveLength(1)
    expect(m[0]).toMatchObject({ stage: 'final', teamA: 't1', teamB: 't2' })
    expect(m.some(x => x.stage === 'third_place')).toBe(false)
  })

  test('N=8: qf(4)+sf(2)+final(1)+3.(1) = 8 tekem', () => {
    const m = buildKnockoutBracket(['t1','t2','t3','t4','t5','t6','t7','t8'])
    expect(m.filter(x => x.stage === 'qf')).toHaveLength(4)
    expect(m.filter(x => x.stage === 'sf')).toHaveLength(2)
    expect(m.filter(x => x.stage === 'final')).toHaveLength(1)
    expect(m.filter(x => x.stage === 'third_place')).toHaveLength(1)
  })
})

const row = (o: Partial<KoMatchRow> & { id: string; stage: KoMatchRow['stage']; match_number: number }): KoMatchRow => ({
  team_a_id: null, team_b_id: null, winner_id: null, is_bye: false, ...o,
})

describe('seedRegistrations', () => {
  test('posamezno: padajoče po točkah igralca', () => {
    const regs: SeedableReg[] = [
      { id: 'r1', player1_id: 'a', player2_id: null },
      { id: 'r2', player1_id: 'b', player2_id: null },
      { id: 'r3', player1_id: 'c', player2_id: null },
    ]
    const pts = { a: 10, b: 30, c: 20 }
    expect(seedRegistrations(regs, pts)).toEqual(['r2', 'r3', 'r1'])
  })

  test('dvojice: padajoče po vsoti točk para', () => {
    const regs: SeedableReg[] = [
      { id: 'r1', player1_id: 'a', player2_id: 'b' }, // 10+5 = 15
      { id: 'r2', player1_id: 'c', player2_id: 'd' }, // 20+20 = 40
    ]
    const pts = { a: 10, b: 5, c: 20, d: 20 }
    expect(seedRegistrations(regs, pts)).toEqual(['r2', 'r1'])
  })

  test('brez točk (0) uvrščen zadnji; izenačenje po id', () => {
    const regs: SeedableReg[] = [
      { id: 'rB', player1_id: 'x', player2_id: null },
      { id: 'rA', player1_id: 'y', player2_id: null },
      { id: 'rC', player1_id: 'z', player2_id: null },
    ]
    const pts = { z: 5 }
    expect(seedRegistrations(regs, pts)).toEqual(['rC', 'rA', 'rB'])
  })
})

describe('knockoutPropagation', () => {
  test('zmagovalci sf → finale; poraženca sf → tekma za 3.', () => {
    const matches: KoMatchRow[] = [
      row({ id: 'sf1', stage: 'sf', match_number: 1, team_a_id: 'A', team_b_id: 'B', winner_id: 'A' }),
      row({ id: 'sf2', stage: 'sf', match_number: 2, team_a_id: 'C', team_b_id: 'D', winner_id: 'D' }),
      row({ id: 'f',   stage: 'final', match_number: 1 }),
      row({ id: 'tp',  stage: 'third_place', match_number: 1 }),
    ]
    const u = knockoutPropagation(matches)
    expect(u).toContainEqual({ id: 'f', slot: 'team_a_id', teamId: 'A' })
    expect(u).toContainEqual({ id: 'f', slot: 'team_b_id', teamId: 'D' })
    expect(u).toContainEqual({ id: 'tp', slot: 'team_a_id', teamId: 'B' })
    expect(u).toContainEqual({ id: 'tp', slot: 'team_b_id', teamId: 'C' })
  })

  test('bye zmagovalec prvega kroga napreduje', () => {
    const matches: KoMatchRow[] = [
      row({ id: 'q1', stage: 'qf', match_number: 1, team_a_id: 'A', team_b_id: null, winner_id: 'A', is_bye: true }),
      row({ id: 'q2', stage: 'qf', match_number: 2, team_a_id: 'B', team_b_id: 'C', winner_id: null }),
      row({ id: 's1', stage: 'sf', match_number: 1 }),
    ]
    const u = knockoutPropagation(matches)
    expect(u).toContainEqual({ id: 's1', slot: 'team_a_id', teamId: 'A' })
  })

  test('ne predlaga sprememb, če je mesto že pravilno', () => {
    const matches: KoMatchRow[] = [
      row({ id: 'sf1', stage: 'sf', match_number: 1, team_a_id: 'A', team_b_id: 'B', winner_id: 'A' }),
      row({ id: 'f',   stage: 'final', match_number: 1, team_a_id: 'A' }),
    ]
    const u = knockoutPropagation(matches)
    expect(u.find(x => x.id === 'f' && x.slot === 'team_a_id')).toBeUndefined()
  })

  test('vrže napako, če manjka vmesni krog (nepravilna mreža)', () => {
    const matches: KoMatchRow[] = [
      row({ id: 'r32a', stage: 'r32', match_number: 1, team_a_id: 'A', team_b_id: 'B', winner_id: 'A' }),
      row({ id: 'qf1',  stage: 'qf',  match_number: 1 }), // r16 manjka namenoma
    ]
    expect(() => knockoutPropagation(matches)).toThrow()
  })

  test('sprejme veljavno delno mrežo, ki se začne pri qf', () => {
    const matches: KoMatchRow[] = [
      row({ id: 'qf1', stage: 'qf', match_number: 1, team_a_id: 'A', team_b_id: 'B', winner_id: 'A' }),
      row({ id: 'qf2', stage: 'qf', match_number: 2, team_a_id: 'C', team_b_id: 'D', winner_id: 'C' }),
      row({ id: 'sf1', stage: 'sf', match_number: 1 }),
      row({ id: 'fin', stage: 'final', match_number: 1 }),
    ]
    expect(() => knockoutPropagation(matches)).not.toThrow()
  })
})
