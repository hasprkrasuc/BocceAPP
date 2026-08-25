import { describe, test, expect } from 'vitest'
import { splitPlayerIds, UUID_RE, oznakaIgralca } from './playerNames'

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

describe('oznakaIgralca', () => {
  test('doda letnico v oklepaju', () => {
    expect(oznakaIgralca({ full_name: 'ZZ Testni', birth_year: 1961 })).toBe('ZZ Testni (1961)')
  })

  test('brez letnice ne pusti praznega oklepaja', () => {
    // Pri sodnikih je datum rojstva pogosto prazen — "Ime ()" bi bilo videti kot napaka.
    expect(oznakaIgralca({ full_name: 'ZZ Testni', birth_year: null })).toBe('ZZ Testni')
    expect(oznakaIgralca({ full_name: 'ZZ Testni' })).toBe('ZZ Testni')
  })

  test('klub se pripne samo, kadar je izrecno zahtevan', () => {
    const p = { full_name: 'ZZ Testni', birth_year: 1961, club: 'ZZ Klub' }
    expect(oznakaIgralca(p)).toBe('ZZ Testni (1961)')
    expect(oznakaIgralca(p, { klub: true })).toBe('ZZ Testni (1961) — ZZ Klub')
  })

  test('zahtevan klub, ki ga ni, ne pusti pomišljaja', () => {
    expect(oznakaIgralca({ full_name: 'ZZ Testni', club: null }, { klub: true })).toBe('ZZ Testni')
  })

  test('soimenjaka iz istega kluba loči letnica', () => {
    // Natanko primer, zaradi katerega je ta oznaka nastala.
    const a = { full_name: 'ZZ Soimenjak', birth_year: 1961, club: 'ZZ Klub' }
    const b = { full_name: 'ZZ Soimenjak', birth_year: 1964, club: 'ZZ Klub' }
    expect(oznakaIgralca(a, { klub: true })).not.toBe(oznakaIgralca(b, { klub: true }))
  })

  test('prazno ime ne da prazne vrstice v izbirniku', () => {
    expect(oznakaIgralca({ full_name: null, birth_year: 1961 })).toBe('(brez imena) (1961)')
    expect(oznakaIgralca({ full_name: '   ' })).toBe('(brez imena)')
  })
})
