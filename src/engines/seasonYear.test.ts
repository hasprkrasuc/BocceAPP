import { describe, test, expect } from 'vitest'
import { zacetnoLetoIzImena, pricakovanaLetnicaSezone, opozoriloOLetnici } from './seasonYear'

describe('zacetnoLetoIzImena', () => {
  test('prebere oznako sezone iz imena', () => {
    expect(zacetnoLetoIzImena('Super Liga 2026/27')).toBe(2026)
    expect(zacetnoLetoIzImena('1. OBZL Nova Gorica 2026/27')).toBe(2026)
    expect(zacetnoLetoIzImena('2. liga vzhod 2023/24')).toBe(2023)
  })

  test('brez oznake vrne null (ne ugiba iz katerekoli štirimestne številke)', () => {
    expect(zacetnoLetoIzImena('Pokal 2026')).toBeNull()
    expect(zacetnoLetoIzImena('')).toBeNull()
    expect(zacetnoLetoIzImena(null)).toBeNull()
  })
})

describe('pricakovanaLetnicaSezone', () => {
  test('moške lige vodijo končno leto sezone', () => {
    expect(pricakovanaLetnicaSezone('Super Liga 2026/27', 'men')).toBe(2027)
    expect(pricakovanaLetnicaSezone('1. liga 2024/25', 'men')).toBe(2025)
  })

  test('ženske in mladinske vodijo začetno leto', () => {
    expect(pricakovanaLetnicaSezone('1. liga - članice 2026/27', 'women')).toBe(2026)
    expect(pricakovanaLetnicaSezone('U-18 2025/26', 'u18')).toBe(2025)
    expect(pricakovanaLetnicaSezone('1. Državna liga U14 2026/27', 'u14')).toBe(2026)
  })
})

describe('opozoriloOLetnici', () => {
  test('molči, kadar je letnica po navadi kategorije', () => {
    expect(opozoriloOLetnici('Super Liga 2026/27', 'men', 2027)).toBeNull()
    expect(opozoriloOLetnici('U-18 2025/26', 'u18', 2025)).toBeNull()
  })

  test('ujame prav napako, zaradi katere se je vse skupaj začelo', () => {
    // 2026/27 z letnico 2026 je pri moških ligah začetno leto — enako kot 2025/26.
    const o = opozoriloOLetnici('Super Liga 2026/27', 'men', 2026)
    expect(o).toMatch(/2027/)
    expect(o).toMatch(/ne bo ločila/)
  })

  test('molči, kadar imena ni mogoče prebrati (izjeme obstajajo)', () => {
    expect(opozoriloOLetnici('Pokal Slovenije', 'men', 2026)).toBeNull()
  })
})
