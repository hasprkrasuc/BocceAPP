import { describe, it, expect } from 'vitest'
import {
  jePrvenstvoOdigrano, koncniVrstniRedPrvenstva,
  type TekmaVrstnegaReda, type SkupinaVrstnegaReda,
} from './vrstniRed'
import type { MatchStage } from '../types'

const tekma = (
  stage: MatchStage, matchNumber: number,
  teamA: string | null, teamB: string | null,
  scoreA: number | null, scoreB: number | null,
  opts?: Partial<TekmaVrstnegaReda>,
): TekmaVrstnegaReda => ({
  stage, matchNumber, teamA, teamB,
  winner: scoreA !== null && scoreB !== null ? (scoreA > scoreB ? teamA : teamB) : null,
  scoreA, scoreB,
  isBye: false, status: scoreA !== null ? 'completed' : 'pending',
  ...opts,
})

describe('koncniVrstniRedPrvenstva — izločilni del', () => {
  // ČF: a1 izgubi 10:13 (razlika 3, 10 točk), a2 izgubi 5:13 (8, 5),
  //     a3 izgubi 10:13 (3, 10 — enako kot a1 → po imenu), a4 izgubi 12:13 (1, 12)
  const izlocilne = [
    tekma('qf', 1, 'w1', 'a1', 13, 10),
    tekma('qf', 2, 'w2', 'a2', 13, 5),
    tekma('qf', 3, 'a3', 'w3', 10, 13),
    tekma('qf', 4, 'w4', 'a4', 13, 12),
    tekma('sf', 1, 'w1', 'w2', 13, 7),
    tekma('sf', 2, 'w3', 'w4', 13, 9),
    tekma('third_place', 1, 'w2', 'w4', 13, 11),
    tekma('final', 1, 'w1', 'w3', 13, 8),
  ]

  it('finale in tekma za 3. mesto dasta mesta 1–4', () => {
    const m = koncniVrstniRedPrvenstva(izlocilne, [])
    expect(m.get('w1')).toBe(1)
    expect(m.get('w3')).toBe(2)
    expect(m.get('w2')).toBe(3)
    expect(m.get('w4')).toBe(4)
  })

  it('poraženci ČF 5.–8.: najprej manjša razlika, ob enaki več točk, brez deljenih mest', () => {
    const m = koncniVrstniRedPrvenstva(izlocilne, [])
    expect(m.get('a4')).toBe(5) // razlika 1
    expect(m.get('a1')).toBe(6) // razlika 3, 10 točk — pred a3 po abecedi (enak izid)
    expect(m.get('a3')).toBe(7)
    expect(m.get('a2')).toBe(8) // razlika 8
  })

  it('brez tekme za 3. mesto poraženca polfinala razvrsti isto pravilo', () => {
    const brez = izlocilne.filter(t => t.stage !== 'third_place')
    const m = koncniVrstniRedPrvenstva(brez, [])
    expect(m.get('w4')).toBe(3) // izgubil 9:13 (razlika 4)
    expect(m.get('w2')).toBe(4) // izgubil 7:13 (razlika 6)
  })
})

describe('koncniVrstniRedPrvenstva — izpadli iz skupin', () => {
  // Dve skupini po 4: napredujeta g?1 in g?2, tretji in četrti izpadeta.
  const skupina = (p: string, r3: [number, number], r4: [number, number]): SkupinaVrstnegaReda => ({
    velikost: 4,
    tekme: [
      tekma('group', 1, `${p}1`, `${p}4`, 13, 5),
      tekma('group', 2, `${p}2`, `${p}3`, 13, 7),
      tekma('group', 3, `${p}1`, `${p}2`, 13, 9),
      tekma('group', 4, `${p}4`, `${p}3`, r4[1], r4[0]), // poraženec = četrti (p3? ne — poraženec m4)
      tekma('group', 5, `${p}2`, `${p}4`, r3[1], r3[0]), // repasaž: poraženec = tretji
    ],
  })
  // Skupina a: repasaž a4 izgubi 11:13 (razlika 2, 11 točk); m4 a3 izgubi 6:13 (7, 6)
  // Skupina b: repasaž b4 izgubi 7:13 (6, 7);  m4 b3 izgubi 10:13 (3, 10)
  const skupine = [skupina('a', [11, 13], [6, 13]), skupina('b', [7, 13], [10, 13])]
  const izlocilne = [
    tekma('sf', 1, 'a1', 'b2', 13, 6),
    tekma('sf', 2, 'b1', 'a2', 13, 8),
    tekma('third_place', 1, 'b2', 'a2', 13, 10),
    tekma('final', 1, 'a1', 'b1', 13, 12),
  ]

  it('tretji iz skupin pred četrtimi, znotraj ravni po razliki in točkah', () => {
    const m = koncniVrstniRedPrvenstva(izlocilne, skupine)
    expect(m.get('a1')).toBe(1); expect(m.get('b1')).toBe(2)
    expect(m.get('b2')).toBe(3); expect(m.get('a2')).toBe(4)
    // tretja iz skupin (poraženca repasaža): a4 razlika 2 < b4 razlika 6
    expect(m.get('a4')).toBe(5)
    expect(m.get('b4')).toBe(6)
    // četrta (poraženca m4): b3 razlika 3 < a3 razlika 7
    expect(m.get('b3')).toBe(7)
    expect(m.get('a3')).toBe(8)
  })

  it('vsak dobi svoje mesto — brez deljenih', () => {
    const m = koncniVrstniRedPrvenstva(izlocilne, skupine)
    const mesta = [...m.values()].sort((x, y) => x - y)
    expect(mesta).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})

describe('jePrvenstvoOdigrano', () => {
  const skupine: SkupinaVrstnegaReda[] = [{
    velikost: 3,
    tekme: [
      tekma('group', 1, 'x1', 'x2', 13, 4),
      tekma('group', 2, 'x3', null, null, null, { isBye: true, winner: 'x3', status: 'completed' }),
      tekma('group', 3, 'x1', 'x3', 13, 6),
      tekma('group', 4, 'x2', null, null, null, { isBye: true, winner: 'x2', status: 'completed' }),
      tekma('group', 5, 'x3', 'x2', 13, 9),
    ],
  }]

  it('true šele, ko so finale in vse neproste tekme odigrane', () => {
    const koncano = [tekma('final', 1, 'x1', 'x3', 13, 10)]
    expect(jePrvenstvoOdigrano(koncano, skupine)).toBe(true)
    expect(jePrvenstvoOdigrano([tekma('final', 1, 'x1', 'x3', null, null)], skupine)).toBe(false)
    const nedokoncaneSkupine = [{
      velikost: 3,
      tekme: [...skupine[0].tekme.slice(0, 4), tekma('group', 5, 'x3', 'x2', null, null)],
    }]
    expect(jePrvenstvoOdigrano(koncano, nedokoncaneSkupine)).toBe(false)
  })

  it('proste tekme (bye) ne štejejo kot neodigrane', () => {
    expect(jePrvenstvoOdigrano([tekma('final', 1, 'x1', 'x3', 13, 10)], skupine)).toBe(true)
  })
})
