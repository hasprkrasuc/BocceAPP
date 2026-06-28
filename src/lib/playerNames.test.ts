import { describe, test, expect } from 'vitest'
import { splitPlayerIds, UUID_RE } from './playerNames'

describe('splitPlayerIds', () => {
  test('loči UUID-je od prostih imen in odstrani dvojnike', () => {
    const ids = [
      'a2230001-0000-4000-8000-000000000004',
      'Janez Novak',
      'a2230001-0000-4000-8000-000000000004', // dvojnik
      'Marko Kos',
    ]
    const { uuids, names } = splitPlayerIds(ids)
    expect(uuids).toEqual(['a2230001-0000-4000-8000-000000000004'])
    expect(names).toEqual(['Janez Novak', 'Marko Kos'])
  })

  test('UUID_RE prepozna pravi UUID', () => {
    expect(UUID_RE.test('a2230001-0000-4000-8000-000000000004')).toBe(true)
    expect(UUID_RE.test('Janez Novak')).toBe(false)
  })
})
