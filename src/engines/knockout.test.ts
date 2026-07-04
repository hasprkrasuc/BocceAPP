import { describe, test, expect } from 'vitest'
import { bracketSize, seedOrder, firstStageForSize } from './knockout'

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
