import { describe, test, expect } from 'vitest'
import { vrsticeSodnikov } from './podpisiZapisnika'

describe('vrsticeSodnikov', () => {
  test('delegiran sodnik se izpiše z imenom (regresija Drago Huško)', () => {
    // Ista oseba je bila na enih tekmah glavni sodnik, na drugi navaden.
    // Kot glavni se je izpisala, kot sodnik pa ne — vrstica je bila prazna.
    const imena = { g: 'Ana Glavna', d: 'Drago Huško' }
    expect(vrsticeSodnikov('g', ['d'], imena)).toEqual([
      ['Glavni sodnik', 'Ana Glavna'],
      ['Sodnik', 'Drago Huško'],
    ])
  })

  test('brez delegiranih sodnikov ostane prazna črta za ročni podpis', () => {
    expect(vrsticeSodnikov('g', [], { g: 'Ana Glavna' })).toEqual([
      ['Glavni sodnik', 'Ana Glavna'],
      ['Sodnik', ''],
    ])
  })

  test('več sodnikov dobi vsak svojo oštevilčeno vrstico', () => {
    const imena = { g: 'Ana', a: 'Bine', b: 'Cveta' }
    expect(vrsticeSodnikov('g', ['a', 'b'], imena)).toEqual([
      ['Glavni sodnik', 'Ana'],
      ['Sodnik 1', 'Bine'],
      ['Sodnik 2', 'Cveta'],
    ])
  })

  test('glavni sodnik se ne podvoji, če je tudi med sodniki', () => {
    const imena = { g: 'Ana' }
    expect(vrsticeSodnikov('g', ['g'], imena)).toEqual([
      ['Glavni sodnik', 'Ana'],
      ['Sodnik', ''],
    ])
  })

  test('neznano ime ne podre vrstice — črta ostane', () => {
    expect(vrsticeSodnikov('x', ['y'], {})).toEqual([
      ['Glavni sodnik', ''],
      ['Sodnik', ''],
    ])
  })

  test('prazni id-ji med sodniki se izpustijo', () => {
    expect(vrsticeSodnikov('', ['', 'd'], { d: 'Drago Huško' })).toEqual([
      ['Glavni sodnik', ''],
      ['Sodnik', 'Drago Huško'],
    ])
  })
})
