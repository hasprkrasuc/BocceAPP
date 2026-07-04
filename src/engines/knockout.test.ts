import { describe, test, expect } from 'vitest'
import { bracketSize, seedOrder, firstStageForSize } from './knockout'
import { buildKnockoutBracket } from './knockout'

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
