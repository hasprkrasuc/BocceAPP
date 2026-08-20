import { describe, test, expect } from 'vitest'
import { zacniZreb, izvleciUdelezenca, izvleciStevilko, jeKoncano, preveri } from './zreb'
import { mulberry32, randIntIz } from './zreb.test'
import { ligaskiOpis, type LigaEkipa } from './zrebLiga'

const ekipe = (n: number, skupno: Record<string, string> = {}): LigaEkipa[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `t${i + 1}`,
    ime: `Ekipa ${i + 1}`,
    shared_venue_key: skupno[`t${i + 1}`] ?? null,
  }))

const odigraj = (opis: ReturnType<typeof ligaskiOpis>, seme: number) => {
  const r = randIntIz(mulberry32(seme))
  let s = zacniZreb(opis)
  while (!jeKoncano(opis, s)) s = izvleciStevilko(opis, izvleciUdelezenca(opis, s, r), r)
  return s
}

describe('ligaški opis — flat in split', () => {
  test('flat ima dva koraka (soigriščni pari, nato ostali) in številke 1..N', () => {
    const o = ligaskiOpis({ format: 'flat', double_round: true, berger_mirror: false }, ekipe(12), [])
    expect(o.koraki).toHaveLength(2)
    expect(o.koraki[0].stevilke(zacniZreb(o))).toEqual([1,2,3,4,5,6,7,8,9,10,11,12])
    expect(o.koraki[1].stevilke(zacniZreb(o))).toEqual([1,2,3,4,5,6,7,8,9,10,11,12])
  })

  test('vsaka ekipa dobi različno številko 1..N', () => {
    const o = ligaskiOpis({ format: 'flat', double_round: true, berger_mirror: false }, ekipe(10), [])
    const s = odigraj(o, 1)
    const st = Object.values(s.dodeljene[0])
    expect(st).toHaveLength(10)
    expect(new Set(st).size).toBe(10)
    expect(st.sort((a, b) => a - b)).toEqual([1,2,3,4,5,6,7,8,9,10])
    expect(preveri(o, s)).toEqual([])
  })

  test('split je za žreb enak flat z desetimi ekipami', () => {
    const o = ligaskiOpis({ format: 'split', double_round: true, berger_mirror: false }, ekipe(10), [])
    expect(o.koraki).toHaveLength(2)
    expect(o.koraki[0].stevilke(zacniZreb(o))).toHaveLength(10)
  })
})
