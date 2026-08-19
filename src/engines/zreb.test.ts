import { describe, test, expect } from 'vitest'
import {
  zacniZreb, kandidati, preostale, jeKoncano,
  type ZrebOpis, type ZrebStanje,
} from './zreb'

/** Preprost opis za teste: 4 udeleženci, številke 1..4, brez omejitev. */
export function preprostOpis(n = 4): ZrebOpis {
  const ids = Array.from({ length: n }, (_, i) => `e${i + 1}`)
  return {
    udelezenci: ids.map(id => ({ id, ime: id.toUpperCase() })),
    koraki: [{
      naziv: 'Številke',
      predal: 0,
      udelezenci: () => ids,
      stevilke: () => Array.from({ length: n }, (_, i) => i + 1),
      veljavne: (s, _id) => preostaleV(s, 0, n),
    }],
  }
}

function preostaleV(s: ZrebStanje, predal: number, n: number): number[] {
  const vzete = new Set(Object.values(s.dodeljene[predal] ?? {}))
  return Array.from({ length: n }, (_, i) => i + 1).filter(x => !vzete.has(x))
}

describe('pogon žreba — stanje', () => {
  test('začetno stanje je prazno in na prvem koraku', () => {
    const s = zacniZreb(preprostOpis())
    expect(s.korak).toBe(0)
    expect(s.cakajoca).toBeNull()
    expect(s.dnevnik).toEqual([])
    expect(s.dodeljene).toEqual({})
  })

  test('kandidati so vsi udeleženci koraka', () => {
    const o = preprostOpis()
    expect(kandidati(o, zacniZreb(o))).toEqual(['e1', 'e2', 'e3', 'e4'])
  })

  test('kandidati so samo čakajoča, ko je udeleženec že izvlečen', () => {
    const o = preprostOpis()
    const s = { ...zacniZreb(o), cakajoca: 'e3' }
    expect(kandidati(o, s)).toEqual(['e3'])
  })

  test('preostale odšteje že dodeljene številke', () => {
    const o = preprostOpis()
    const s: ZrebStanje = { ...zacniZreb(o), dodeljene: { 0: { e1: 2 } } }
    expect(preostale(o, s)).toEqual([1, 3, 4])
  })

  test('jeKoncano je res šele, ko imajo vsi udeleženci vseh korakov številko', () => {
    const o = preprostOpis()
    const s = zacniZreb(o)
    expect(jeKoncano(o, s)).toBe(false)
    const poln: ZrebStanje = { ...s, dodeljene: { 0: { e1: 1, e2: 2, e3: 3, e4: 4 } } }
    expect(jeKoncano(o, poln)).toBe(true)
  })
})
