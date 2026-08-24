import { describe, test, expect } from 'vitest'
import {
  zacetnoLetoIzImena, pricakovanaLetnicaSezone, opozoriloOLetnici,
  predlaganaOznakaSezone, opozoriloOOznakiSezone,
} from './seasonYear'

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

describe('predlaganaOznakaSezone', () => {
  test('moška liga vodi končno leto, zato je 2027 sezona 2026/27', () => {
    expect(predlaganaOznakaSezone('men', 2027)).toBe('2026/27')
  })

  test('ženske in mladinske vodijo začetno leto, zato je 2026 sezona 2026/27', () => {
    expect(predlaganaOznakaSezone('women', 2026)).toBe('2026/27')
    expect(predlaganaOznakaSezone('u14', 2026)).toBe('2026/27')
  })

  test('prehod stoletja se izpiše dvomestno z vodilno ničlo', () => {
    expect(predlaganaOznakaSezone('women', 1999)).toBe('1999/00')
    expect(predlaganaOznakaSezone('women', 2000)).toBe('2000/01')
  })

  test('brez verjetne letnice ni predloga', () => {
    expect(predlaganaOznakaSezone('men', null)).toBeNull()
    expect(predlaganaOznakaSezone('men', undefined)).toBeNull()
    expect(predlaganaOznakaSezone('men', 12)).toBeNull()
  })
})

describe('opozoriloOOznakiSezone', () => {
  test('ime brez oznake sezone opozori in predlaga obliko', () => {
    // Tako je nastala »1. liga OBZ Gorenjska«: obrazec je bil tiho, ker
    // opozoriloOLetnici brez oznake nima česa primerjati.
    const o = opozoriloOOznakiSezone('1. liga OBZ Gorenjska', 'men', 2027)
    expect(o).toMatch(/začne v enem letu/i)
    expect(o).toMatch(/1\. liga OBZ Gorenjska 2026\/27/)
  })

  test('ime z oznako ne opozarja', () => {
    expect(opozoriloOOznakiSezone('1. liga OBZ Gorenjska 2026/27', 'men', 2027)).toBeNull()
    expect(opozoriloOOznakiSezone('U-14 2025/26', 'u14', 2025)).toBeNull()
  })

  test('prazno ime ne opozarja — obrazec se šele izpolnjuje', () => {
    expect(opozoriloOOznakiSezone('', 'men', 2027)).toBeNull()
    expect(opozoriloOOznakiSezone('   ', 'men', 2027)).toBeNull()
    expect(opozoriloOOznakiSezone(null, 'men', 2027)).toBeNull()
  })

  test('brez letnice opozori, a brez predloga', () => {
    const o = opozoriloOOznakiSezone('Pokal Gorenjske', 'men', null)
    expect(o).toMatch(/oznako sezone\./)
    expect(o).not.toMatch(/npr\./)
  })

  test('letnica v imenu brez poševnice ne velja za oznako sezone', () => {
    // »Pokal 2026« ni sezona 2026/27 — enolet(n)o tekmovanje bi tu tiho prešlo.
    expect(opozoriloOOznakiSezone('Pokal 2026', 'men', 2027)).toMatch(/oznako sezone/)
  })
})
