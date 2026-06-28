import { describe, test, expect } from 'vitest'
import { findPlayerRank, findPlayerRankInCategories } from './findPlayerRank'

describe('findPlayerRank', () => {
  const rows = [
    { playerId: 'a', rang: 12.4 },
    { playerId: 'b', rang: 11.1 },
    { playerId: 'c', rang: 8.0 },
  ]

  test('vrne mesto (1-indeksirano) in točke za igralca', () => {
    expect(findPlayerRank(rows, 'a')).toEqual({ mesto: 1, rang: 12.4 })
    expect(findPlayerRank(rows, 'c')).toEqual({ mesto: 3, rang: 8.0 })
  })

  test('vrne null, če igralca ni na lestvici', () => {
    expect(findPlayerRank(rows, 'x')).toBeNull()
  })
})

describe('findPlayerRankInCategories', () => {
  const byCategory = {
    men: [{ playerId: 'a', rang: 12.4 }, { playerId: 'b', rang: 11.1 }],
    women: [{ playerId: 'c', rang: 9.0 }],
    u18: [{ playerId: 'b', rang: 3.0 }],
    u14: [],
  }

  test('vrne mesto, točke in kategorijo, kjer igralec nastopa', () => {
    expect(findPlayerRankInCategories(byCategory, 'a')).toEqual({ mesto: 1, rang: 12.4, category: 'men' })
    expect(findPlayerRankInCategories(byCategory, 'c')).toEqual({ mesto: 1, rang: 9.0, category: 'women' })
  })

  test('če igralec nastopa v več kategorijah, vrne tisto z višjim rangom', () => {
    // b je v men (11.1) in u18 (3.0) → izbere men
    expect(findPlayerRankInCategories(byCategory, 'b')).toEqual({ mesto: 2, rang: 11.1, category: 'men' })
  })

  test('vrne null, če igralca ni nikjer', () => {
    expect(findPlayerRankInCategories(byCategory, 'x')).toBeNull()
  })
})
