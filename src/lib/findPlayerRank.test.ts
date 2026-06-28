import { describe, test, expect } from 'vitest'
import { findPlayerRank } from './findPlayerRank'

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
