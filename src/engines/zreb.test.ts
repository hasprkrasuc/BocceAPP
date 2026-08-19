import { describe, test, expect } from 'vitest'
import {
  zacniZreb, kandidati, preostale, jeKoncano, izvleciUdelezenca, izvleciStevilko, preveri,
  type ZrebOpis, type ZrebStanje,
} from './zreb'

/** Ponovljiv generator za teste. */
export function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export const randIntIz = (prng: () => number) => (n: number) => Math.floor(prng() * n)

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

describe('pogon žreba — potegi', () => {
  test('izvleciUdelezenca nastavi čakajočo in ne dodeli številke', () => {
    const o = preprostOpis()
    const s0 = zacniZreb(o)
    const s1 = izvleciUdelezenca(o, s0, randIntIz(mulberry32(1)))
    expect(s1.cakajoca).not.toBeNull()
    expect(s0.cakajoca).toBeNull()   // izvirno stanje ostane nedotaknjeno
    expect(s1.dodeljene).toEqual({})
    expect(s1.dnevnik).toHaveLength(1)
  })

  test('dvakratno žrebanje udeleženca javi napako', () => {
    const o = preprostOpis()
    const r = randIntIz(mulberry32(1))
    const s1 = izvleciUdelezenca(o, zacniZreb(o), r)
    expect(() => izvleciUdelezenca(o, s1, r)).toThrow(/že izvlečen/)
  })

  test('žrebanje številke brez izvlečenega udeleženca javi napako', () => {
    const o = preprostOpis()
    expect(() => izvleciStevilko(o, zacniZreb(o), randIntIz(mulberry32(1)))).toThrow(/najprej izvleci/)
  })

  test('celoten žreb dodeli vse številke in napreduje čez korake', () => {
    const o = preprostOpis()
    const r = randIntIz(mulberry32(42))
    let s = zacniZreb(o)
    let potez = 0
    while (!jeKoncano(o, s)) { s = izvleciStevilko(o, izvleciUdelezenca(o, s, r), r); potez++ }
    expect(potez).toBe(4)
    expect(Object.keys(s.dodeljene[0])).toHaveLength(4)
    expect(new Set(Object.values(s.dodeljene[0])).size).toBe(4)
    expect(preostale(o, s, 0)).toEqual([])
  })

  test('posledice dodelijo tudi druge udeležence', () => {
    const o = preprostOpis()
    o.koraki[0].posledice = (_s, id, st) =>
      id === 'e1' ? [{ udelezenecId: 'e2', stevilka: st === 1 ? 2 : 1, samodejno: true, razlog: 'preizkus' }] : []
    const r = randIntIz(mulberry32(3))
    let s = izvleciUdelezenca(o, zacniZreb(o), r)
    s = { ...s, cakajoca: 'e1' }
    s = izvleciStevilko(o, s, r)
    expect(s.dodeljene[0].e1).toBeDefined()
    expect(s.dodeljene[0].e2).toBeDefined()
    expect(s.dnevnik.some(v => v.samodejno && v.razlog === 'preizkus')).toBe(true)
  })

  test('brez veljavne številke javi napako in ne spremeni stanja', () => {
    const o = preprostOpis()
    o.koraki[0].veljavne = () => []
    const r = randIntIz(mulberry32(5))
    const s = { ...zacniZreb(o), cakajoca: 'e1' }
    expect(() => izvleciStevilko(o, s, r)).toThrow(/ni nobene veljavne/)
  })
})

describe('pogon žreba — invariante', () => {
  test('pravilen žreb nima napak', () => {
    const o = preprostOpis()
    const r = randIntIz(mulberry32(7))
    let s = zacniZreb(o)
    while (!jeKoncano(o, s)) s = izvleciStevilko(o, izvleciUdelezenca(o, s, r), r)
    expect(preveri(o, s)).toEqual([])
  })

  test('ujame podvojeno številko', () => {
    const o = preprostOpis()
    const s: ZrebStanje = { ...zacniZreb(o), dodeljene: { 0: { e1: 1, e2: 1 } } }
    expect(preveri(o, s).some(x => /podvojena/.test(x))).toBe(true)
  })

  test('ujame številko zunaj nabora', () => {
    const o = preprostOpis()
    const s: ZrebStanje = { ...zacniZreb(o), dodeljene: { 0: { e1: 99 } } }
    expect(preveri(o, s).some(x => /ni v naboru/.test(x))).toBe(true)
  })

  test('delno stanje ne javi lažnih napak', () => {
    const o = preprostOpis()
    const r = randIntIz(mulberry32(9))
    let s = zacniZreb(o)
    for (let i = 0; i < 2; i++) s = izvleciStevilko(o, izvleciUdelezenca(o, s, r), r)
    expect(preveri(o, s)).toEqual([])
  })

  test('podvojeno številko javi le enkrat, kadar si predal delita dva koraka', () => {
    const o: ZrebOpis = {
      udelezenci: [
        { id: 'e1', ime: 'E1' },
        { id: 'e2', ime: 'E2' },
      ],
      koraki: [
        {
          naziv: 'Prvi',
          predal: 0,
          udelezenci: () => ['e1'],
          stevilke: () => [1, 2],
          veljavne: () => [1, 2],
        },
        {
          naziv: 'Drugi',
          predal: 0,
          udelezenci: () => ['e2'],
          stevilke: () => [1, 2],
          veljavne: () => [1, 2],
        },
      ],
    }
    const s: ZrebStanje = { ...zacniZreb(o), dodeljene: { 0: { e1: 1, e2: 1 } } }
    const napake = preveri(o, s).filter(x => /podvojena/.test(x))
    expect(napake).toHaveLength(1)
  })
})
