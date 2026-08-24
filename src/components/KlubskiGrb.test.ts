import { describe, test, expect } from 'vitest'
import { zacetnice } from './KlubskiGrb'

describe('zacetnice', () => {
  test('dvobesedno ime da prvi črki obeh besed', () => {
    expect(zacetnice('Zabiče Kozlek')).toBe('ZK')
    expect(zacetnice('Velenje Premogovnik')).toBe('VP')
  })

  test('enobesedno ime da prvi dve črki, ne ene same', () => {
    expect(zacetnice('Breza')).toBe('BR')
  })

  test('ločila in večkratni presledki ne štejejo za besede', () => {
    expect(zacetnice('B.K. Repentabor')).toBe('BK')
    expect(zacetnice('  Trata   Škofja Loka ')).toBe('TŠ')
  })

  test('brez imena vrne vprašaj namesto praznega kroga', () => {
    expect(zacetnice(null)).toBe('?')
    expect(zacetnice('')).toBe('?')
    expect(zacetnice('---')).toBe('?')
  })
})
