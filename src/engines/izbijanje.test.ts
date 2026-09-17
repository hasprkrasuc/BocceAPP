import { describe, test, expect } from 'vitest'
import {
  sistemIzbijanja, napredovali, koncniVrstniRed, jeNastopil,
  MEJA_ENA_SERIJA, MEJA_CETRTFINALE,
  type Nastop, type KrogIzbijanja,
} from './izbijanje'

const n = (id: string, stZreba: number, izidi: Partial<Record<KrogIzbijanja, number>>): Nastop =>
  ({ id, stZreba, izidi })

describe('sistemIzbijanja', () => {
  test('do vključno šest tekmovalcev je ena sama serija', () => {
    for (const st of [1, 2, 4, 5, MEJA_ENA_SERIJA]) {
      expect(sistemIzbijanja(st)).toEqual({ krogi: ['finale'], napreduje: [] })
    }
  })

  test('od sedem do petnajst: kvalifikacije in finale štirih', () => {
    for (const st of [7, 8, 9, 15]) {
      expect(sistemIzbijanja(st)).toEqual({ krogi: ['kvalifikacije', 'finale'], napreduje: [4] })
    }
  })

  test('šestnajst in več: kvalifikacije, četrtfinale osmih, finale štirih', () => {
    for (const st of [MEJA_CETRTFINALE, 17, 32]) {
      expect(sistemIzbijanja(st)).toEqual({
        krogi: ['kvalifikacije', 'cetrtfinale', 'finale'], napreduje: [8, 4],
      })
    }
  })

  test('nad 32 tekmovanje ne ostane brez sistema', () => {
    expect(sistemIzbijanja(33).krogi).toHaveLength(3)
  })

  test('nesmiselno število vrže napako', () => {
    expect(() => sistemIzbijanja(0)).toThrow()
    expect(() => sistemIzbijanja(-3)).toThrow()
    expect(() => sistemIzbijanja(2.5)).toThrow()
  })
})

describe('napredovali', () => {
  const sistem = sistemIzbijanja(9)   // kvalifikacije → finale štirih

  test('naprej gredo štirje z največ zadetki', () => {
    const nastopi = [
      n('a', 1, { kvalifikacije: 12 }), n('b', 2, { kvalifikacije: 20 }),
      n('c', 3, { kvalifikacije: 5 }),  n('d', 4, { kvalifikacije: 17 }),
      n('e', 5, { kvalifikacije: 9 }),  n('f', 6, { kvalifikacije: 14 }),
    ]
    const { napreduje, izenaceni } = napredovali(nastopi, 'kvalifikacije', 4, sistem)
    expect(napreduje).toEqual(['b', 'd', 'f', 'a'])
    expect(izenaceni).toEqual([])
  })

  test('kdor v krogu ni nastopil, ne more napredovati', () => {
    const nastopi = [
      n('a', 1, { kvalifikacije: 12 }), n('b', 2, {}),
      n('c', 3, { kvalifikacije: 5 }),
    ]
    expect(napredovali(nastopi, 'kvalifikacije', 4, sistem).napreduje).toEqual(['a', 'c'])
  })

  test('izenačenje ČEZ mejo se označi, ne razreši', () => {
    const nastopi = [
      n('a', 1, { kvalifikacije: 20 }), n('b', 2, { kvalifikacije: 18 }),
      n('c', 3, { kvalifikacije: 15 }), n('d', 4, { kvalifikacije: 11 }),
      n('e', 5, { kvalifikacije: 11 }), n('f', 6, { kvalifikacije: 4 }),
    ]
    const { napreduje, izenaceni } = napredovali(nastopi, 'kvalifikacije', 4, sistem)
    expect(izenaceni.sort()).toEqual(['d', 'e'])
    // Vrstni red je le začasen, dokler sodnik ne vpiše dodatnega izbijanja.
    expect(napreduje).toHaveLength(4)
  })

  test('izenačenje ZNOTRAJ napredovalih ni sporno', () => {
    const nastopi = [
      n('a', 1, { kvalifikacije: 20 }), n('b', 2, { kvalifikacije: 11 }),
      n('c', 3, { kvalifikacije: 11 }), n('d', 4, { kvalifikacije: 9 }),
      n('e', 5, { kvalifikacije: 4 }),
    ]
    expect(napredovali(nastopi, 'kvalifikacije', 4, sistem).izenaceni).toEqual([])
  })
})

describe('koncniVrstniRed', () => {
  test('ena serija da vrstni red kar iz nje', () => {
    const sistem = sistemIzbijanja(4)
    const nastopi = [
      n('Žan', 1, { finale: 8 }), n('Miha', 2, { finale: 17 }),
      n('Jasmin', 3, { finale: 27 }), n('Matic', 4, { finale: 24 }),
    ]
    expect(koncniVrstniRed(nastopi, sistem).map(u => u.id))
      .toEqual(['Jasmin', 'Matic', 'Miha', 'Žan'])   // DP U14 2025
  })

  test('kdor je prišel dlje, je pred tistim, ki ni — tudi z nižjim izidom', () => {
    const sistem = sistemIzbijanja(8)
    const nastopi = [
      n('finalist', 1, { kvalifikacije: 10, finale: 5 }),
      n('izpadli', 2, { kvalifikacije: 40 }),
    ]
    const red = koncniVrstniRed(nastopi, sistem)
    expect(red.map(u => u.id)).toEqual(['finalist', 'izpadli'])
    expect(red[0].zadnjiKrog).toBe('finale')
  })

  test('kdor ni nastopil nikjer, pade na konec po žrebani številki', () => {
    const sistem = sistemIzbijanja(8)
    const nastopi = [
      n('pozen', 9, {}), n('odsoten', 2, {}), n('igral', 1, { kvalifikacije: 3 }),
    ]
    expect(koncniVrstniRed(nastopi, sistem).map(u => u.id)).toEqual(['igral', 'odsoten', 'pozen'])
  })
})

// ── Pravi grafikon: DP natančno zbijanje – člani, Škofja Loka, 30. 11. 2025 ──
describe('DP natančno člani 2025 — vrstni red iz grafikona', () => {
  const sistem = sistemIzbijanja(19)
  const nastopi: Nastop[] = [
    n('Urban Završnik', 1, { kvalifikacije: 3 }),
    n('Jure Fabjan', 2, { kvalifikacije: 13, cetrtfinale: 8 }),
    n('Damir Pintarič', 3, { kvalifikacije: 6 }),
    n('Žan Štunf', 4, { kvalifikacije: 14, cetrtfinale: 5 }),
    n('Sandi Žuran', 5, { kvalifikacije: 19, cetrtfinale: 20, finale: 15 }),
    n('Primož Markočič', 6, { kvalifikacije: 12, cetrtfinale: 9 }),
    n('Drago Štunf', 7, { kvalifikacije: 4 }),
    n('Luka Močnik', 8, { kvalifikacije: 1 }),
    n('Simon Možina', 9, { kvalifikacije: 8 }),
    n('Blaž Janev', 10, { kvalifikacije: 10, cetrtfinale: 13, finale: 5 }),
    n('Klemen Podgoršek', 11, { kvalifikacije: 10, cetrtfinale: 8 }),
    n('Žiga Moličnik', 12, { kvalifikacije: 7 }),
    n('Jože Unetič', 13, { kvalifikacije: 0 }),
    n('Tomaž Bogataj', 14, { kvalifikacije: 14, cetrtfinale: 14, finale: 14 }),
    n('Žiga Štunf', 15, { kvalifikacije: 5 }),
    n('Alen Kariž', 16, {}),
    n('Gregor Korošec', 17, { kvalifikacije: 11, cetrtfinale: 14, finale: 27 }),
    n('Miha Tomše', 18, {}),
    n('Jan Kreševič', 19, { kvalifikacije: 3 }),
  ]

  test('devetnajst prijavljenih igra tri serije', () => {
    expect(sistem.krogi).toEqual(['kvalifikacije', 'cetrtfinale', 'finale'])
  })

  test('v četrtfinale gre osem najboljših iz kvalifikacij', () => {
    const { napreduje, izenaceni } = napredovali(nastopi, 'kvalifikacije', 8, sistem)
    expect(napreduje.sort()).toEqual([
      'Blaž Janev', 'Gregor Korošec', 'Jure Fabjan', 'Klemen Podgoršek',
      'Primož Markočič', 'Sandi Žuran', 'Tomaž Bogataj', 'Žan Štunf',
    ].sort())
    expect(izenaceni).toEqual([])   // deseti ima 8, osmi 10 — meja je čista
    // natanko ti so v grafikonu dobili četrtfinalni izid
    expect(napreduje.sort()).toEqual(
      nastopi.filter(x => jeNastopil(x, 'cetrtfinale')).map(x => x.id).sort())
  })

  test('v finale gredo štirje najboljši iz četrtfinala', () => {
    const { napreduje } = napredovali(nastopi, 'cetrtfinale', 4, sistem)
    expect(napreduje.sort()).toEqual(
      nastopi.filter(x => jeNastopil(x, 'finale')).map(x => x.id).sort())
  })

  test('končni vrstni red se ujema z grafikonom', () => {
    expect(koncniVrstniRed(nastopi, sistem).map(u => u.id)).toEqual([
      'Gregor Korošec', 'Sandi Žuran', 'Tomaž Bogataj', 'Blaž Janev',
      'Primož Markočič', 'Jure Fabjan', 'Klemen Podgoršek', 'Žan Štunf',
      'Simon Možina', 'Žiga Moličnik', 'Damir Pintarič', 'Žiga Štunf',
      'Drago Štunf', 'Urban Završnik', 'Jan Kreševič', 'Luka Močnik', 'Jože Unetič',
      'Alen Kariž', 'Miha Tomše',
    ])
  })

  test('izenačena Fabjan in Podgoršek (oba 8 v četrtfinalu) loči kvalifikacijski izid', () => {
    const red = koncniVrstniRed(nastopi, sistem)
    const mesto = (id: string) => red.find(u => u.id === id)!.mesto
    expect(mesto('Jure Fabjan')).toBe(6)      // kvalifikacije 13
    expect(mesto('Klemen Podgoršek')).toBe(7) // kvalifikacije 10
  })

  test('izenačena Završnik in Kreševič (oba 3) loči žrebana številka', () => {
    const red = koncniVrstniRed(nastopi, sistem)
    expect(red.find(u => u.id === 'Urban Završnik')!.mesto).toBe(14)
    expect(red.find(u => u.id === 'Jan Kreševič')!.mesto).toBe(15)
  })
})
