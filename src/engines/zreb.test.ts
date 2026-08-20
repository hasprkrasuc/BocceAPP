import { describe, test, expect } from 'vitest'
import {
  zacniZreb, kandidati, preostale, jeKoncano, izvleciUdelezenca, izvleciStevilko, preveri,
  type ZrebOpis, type ZrebStanje, type Korak,
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

  test('korak z enolicne: false ne javi podvojene napake, a še vedno ujame številko zunaj nabora', () => {
    const o: ZrebOpis = {
      udelezenci: ['t1', 't2', 't3', 't4'].map(id => ({ id, ime: id.toUpperCase() })),
      koraki: [{
        naziv: 'Skupina',
        predal: 0,
        enolicne: false,
        udelezenci: () => ['t1', 't2', 't3', 't4'],
        stevilke: () => [1, 2],
        veljavne: () => [1, 2],
      }],
    }
    // t1 in t2 imata isto oznako skupine (pravilno — to je bistvo oznake),
    // t4 pa ima številko zunaj nabora (99 ni ne 1 ne 2).
    const s: ZrebStanje = { ...zacniZreb(o), dodeljene: { 0: { t1: 1, t2: 1, t3: 2, t4: 99 } } }
    const napake = preveri(o, s)
    expect(napake.some(x => /podvojena/.test(x))).toBe(false)
    expect(napake.some(x => /ni v naboru/.test(x))).toBe(true)
  })

  test('privzeto je enoličnost obvezna: brez enolicne isti razpored še vedno javi podvojeno napako', () => {
    const o: ZrebOpis = {
      udelezenci: ['t1', 't2', 't3', 't4'].map(id => ({ id, ime: id.toUpperCase() })),
      koraki: [{
        naziv: 'Skupina',
        predal: 0,
        // enolicne ni nastavljen — privzeto mora ostati true.
        udelezenci: () => ['t1', 't2', 't3', 't4'],
        stevilke: () => [1, 2],
        veljavne: () => [1, 2],
      }],
    }
    const s: ZrebStanje = { ...zacniZreb(o), dodeljene: { 0: { t1: 1, t2: 1, t3: 2, t4: 99 } } }
    const napake = preveri(o, s)
    expect(napake.some(x => /podvojena/.test(x))).toBe(true)
  })

  test('kadar si predal delita dva koraka in eden od njiju ni enoličen, se cel predal obravnava kot ne-enoličen', () => {
    // Namerno: enoličnost je last predala (skupnega nabora), ne posameznega
    // koraka — če en korak pove, da se v tem predalu številke smejo ponoviti,
    // to velja za CEL predal, ne le za vnose tega koraka.
    const o: ZrebOpis = {
      udelezenci: ['t1', 't2'].map(id => ({ id, ime: id.toUpperCase() })),
      koraki: [
        {
          naziv: 'Prvi',
          predal: 0,
          // ta korak ne pove nič o enoličnosti — a ker jo Drugi izklopi, to velja za oba.
          udelezenci: () => ['t1'],
          stevilke: () => [1, 2],
          veljavne: () => [1, 2],
        },
        {
          naziv: 'Drugi',
          predal: 0,
          enolicne: false,
          udelezenci: () => ['t2'],
          stevilke: () => [1, 2],
          veljavne: () => [1, 2],
        },
      ],
    }
    const s: ZrebStanje = { ...zacniZreb(o), dodeljene: { 0: { t1: 1, t2: 1 } } }
    expect(preveri(o, s).some(x => /podvojena/.test(x))).toBe(false)
  })

  test('žreb skupin (oznaka skupine v predalu, enolicne: false) skozi celoten žreb ne javi lažnih napak', () => {
    // Oblika kot pri ligaškem prilagojevalniku: prvi korak dodeli OZNAKO
    // skupine (1 ali 2) — soigriščni par gre namerno v nasprotno skupino, da
    // se izogneta skupnemu igrišču. Nato vsaka skupina žreba svoje številke
    // znotraj lastnega predala.
    const parInfo: Record<string, string> = { t1: 't2', t3: 't4', t5: 't6' }
    const vsi = ['t1', 't2', 't3', 't4', 't5', 't6']

    const skupinaKorak: Korak = {
      naziv: 'Skupina',
      predal: 0,
      enolicne: false,
      udelezenci: () => Object.keys(parInfo),
      stevilke: () => [1, 2],
      veljavne: () => [1, 2],
      posledice: (_s, id, st) => {
        const partner = parInfo[id]
        return partner
          ? [{ udelezenecId: partner, stevilka: st === 1 ? 2 : 1, samodejno: true, razlog: 'skupno igrišče — ločena skupina' }]
          : []
      },
    }
    const stevilkeSkupine = (skupina: number): Korak => ({
      naziv: `Številke skupine ${skupina}`,
      predal: skupina,
      udelezenci: (s) => vsi.filter(id => s.dodeljene[0]?.[id] === skupina),
      stevilke: () => [1, 2, 3],
      veljavne: (s) => {
        const vzete = new Set(Object.values(s.dodeljene[skupina] ?? {}))
        return [1, 2, 3].filter(x => !vzete.has(x))
      },
    })

    const o: ZrebOpis = {
      udelezenci: vsi.map(id => ({ id, ime: id.toUpperCase() })),
      koraki: [skupinaKorak, stevilkeSkupine(1), stevilkeSkupine(2)],
    }

    let steviloStanj = 0
    for (const [semeUdel, semeStev] of [[1, 2], [3, 4], [5, 6], [7, 8]]) {
      const rUdel = randIntIz(mulberry32(semeUdel))
      const rStev = randIntIz(mulberry32(semeStev))
      let s = zacniZreb(o)
      expect(preveri(o, s)).toEqual([])
      steviloStanj++
      let varovalka = 0
      while (!jeKoncano(o, s)) {
        if (varovalka++ > 100) throw new Error('neskončna zanka — preveri opis')
        s = izvleciUdelezenca(o, s, rUdel)
        expect(preveri(o, s)).toEqual([])
        steviloStanj++
        s = izvleciStevilko(o, s, rStev)
        expect(preveri(o, s)).toEqual([])
        steviloStanj++
      }
    }
    expect(steviloStanj).toBeGreaterThan(0)
  })
})
