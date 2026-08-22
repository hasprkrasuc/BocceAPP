import { describe, test, expect } from 'vitest'
import { spremembe, type LigaskoIzhodisce } from './zrebSpremembe'
import { PREDAL_SKUPINE, PREDAL_A, PREDAL_B, type LigaEkipa } from '../engines/zrebLiga'
import type { ZrebStanje } from '../engines/zreb'

// Stanja gradimo ročno kot navadne objekte — brez uvoza pogona za žrebanje,
// da ta test preverja izključno preslikavo v `spremembe`.
const stanje = (dodeljene: Record<number, Record<string, number>>): ZrebStanje => ({
  dodeljene, korak: 0, cakajoca: null, dnevnik: [],
})

const ekipe = (n: number): LigaEkipa[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `t${i + 1}`, ime: `Ekipa ${i + 1}`, shared_venue_key: null,
  }))

const izhodisce = (format: LigaskoIzhodisce['nastavitve']['format'], n: number): LigaskoIzhodisce => ({
  nastavitve: { format, double_round: true, berger_mirror: false },
  ekipe: ekipe(n),
  nosilniVrstniRed: [],
  imeSezone: 'Testna sezona',
})

describe('spremembe — format flat/split', () => {
  test('vsaka ekipa se pojavi enkrat, group_label je null, številke ustrezajo stanju', () => {
    const izh = izhodisce('flat', 3)
    const s = stanje({ [PREDAL_SKUPINE]: { t1: 2, t2: 1, t3: 3 } })
    const out = spremembe(izh, s)

    expect(out).toHaveLength(3)
    expect(new Set(out.map(o => o.id)).size).toBe(3)
    expect(out.every(o => o.group_label === null)).toBe(true)

    const stPoId = new Map(out.map(o => [o.id, o.draw_number]))
    expect(stPoId.get('t1')).toBe(2)
    expect(stPoId.get('t2')).toBe(1)
    expect(stPoId.get('t3')).toBe(3)

    const imePoId = new Map(out.map(o => [o.id, o.ime]))
    expect(imePoId.get('t1')).toBe('Ekipa 1')
  })

  test('split se obnaša enako kot flat (isti predal PREDAL_SKUPINE)', () => {
    const izh = izhodisce('split', 2)
    const s = stanje({ [PREDAL_SKUPINE]: { t1: 1, t2: 2 } })
    const out = spremembe(izh, s)
    expect(out).toHaveLength(2)
    expect(out.every(o => o.group_label === null)).toBe(true)
  })
})

describe('spremembe — format groups', () => {
  test('vseh 12 ekip je prisotnih natanko enkrat, z ustreznim group_label', () => {
    const izh = izhodisce('groups', 12)
    const s = stanje({
      [PREDAL_A]: { t1: 1, t2: 2, t3: 3, t4: 4, t5: 5, t6: 6 },
      [PREDAL_B]: { t7: 1, t8: 2, t9: 3, t10: 4, t11: 5, t12: 6 },
    })
    const out = spremembe(izh, s)

    expect(out).toHaveLength(12)
    const idji = out.map(o => o.id)
    expect(new Set(idji).size).toBe(12)

    const skupinaPoId = new Map(out.map(o => [o.id, o.group_label]))
    for (let i = 1; i <= 6; i++) expect(skupinaPoId.get(`t${i}`)).toBe('A')
    for (let i = 7; i <= 12; i++) expect(skupinaPoId.get(`t${i}`)).toBe('B')

    const stPoId = new Map(out.map(o => [o.id, o.draw_number]))
    expect(stPoId.get('t1')).toBe(1)
    expect(stPoId.get('t7')).toBe(1)
    expect(stPoId.get('t12')).toBe(6)
  })
})

describe('spremembe — nedokončano stanje', () => {
  test('nepopolno stanje vrne samo doslej izžrebane ekipe', () => {
    const izh = izhodisce('flat', 5)
    const s = stanje({ [PREDAL_SKUPINE]: { t1: 1, t3: 2 } })
    const out = spremembe(izh, s)
    expect(out).toHaveLength(2)
    expect(new Set(out.map(o => o.id))).toEqual(new Set(['t1', 't3']))
  })

  test('nepopolno stanje za groups vrne samo ekipe, ki so že v enem od predalov A/B', () => {
    const izh = izhodisce('groups', 12)
    const s = stanje({ [PREDAL_A]: { t1: 1 } })
    const out = spremembe(izh, s)
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({ id: 't1', ime: 'Ekipa 1', draw_number: 1, group_label: 'A' })
  })
})

describe('spremembe — neznan id', () => {
  test('id, ki ga ni med ekipami izhodišča, se pokaže kot id namesto da vrže napako', () => {
    const izh = izhodisce('flat', 2)
    const s = stanje({ [PREDAL_SKUPINE]: { neznan: 1, t1: 2 } })
    const out = spremembe(izh, s)
    const vrstica = out.find(o => o.id === 'neznan')
    expect(vrstica).toBeDefined()
    expect(vrstica?.ime).toBe('neznan')
    expect(vrstica?.draw_number).toBe(1)
  })
})
