/**
 * URADNI RAZPORED — 1. OBZL Nova Gorica 2026/27
 *
 * Ta test pripne razpored, kakršnega je zveza razdelila klubom. Ni izmišljen
 * primer: če se Bergerjeva tabela, zrcaljenje ali razpored drugega dela kdaj
 * spremenijo, mora pasti test, ne sezona sredi septembra.
 *
 * Dvoje, kar je preverba pokazala:
 *
 * 1. Pari in kola se ujemajo z `BERGER_TABLES[10]`, a le pri eni sami dodelitvi
 *    žrebanih številk (spodaj). Pri njej je dom/gost obrnjen pri vseh 45 tekmah
 *    — zato `mirror`. Ker je dodelitev ena sama, zrcaljenja ni mogoče
 *    nadomestiti z drugačnim žrebom; brez njega bi bila vsaka tekma razpisana
 *    pri napačnem klubu.
 *
 * 2. Razpored obeh skupin drugega dela se ujema z motorjem v vseh petih kolih,
 *    vključno s tem, katera ekipa počiva — z eno izjemo: v uradnem dokumentu je
 *    v skupini 6-10, 4. krog, zapisano "1 : 4 ali 4 : 1", kar je prekopirano iz
 *    skupine 1-5. Ker sta prosta 10 in v paru že 6:9, mora biti 7:8. Spodaj je
 *    zapisano pravilno; napaka je v dokumentu, ne v kodi.
 */

import { describe, it, expect } from 'vitest'
import { bergerFixtures, bergerSchedule } from './berger'
import { splitPhase2Fixtures, SPLIT_TOP, SPLIT_BOTTOM, SPLIT_PHASE1_ROUNDS } from './leagueSplit'

/** Edina dodelitev žrebanih številk, ki da uradne pare in kola. */
const ZREB: Record<string, number> = {
  KRAS: 1, OREHOVLJE: 2, DESKLE: 3, GORICA: 4, HUBELJ: 5,
  SOCA: 6, SEMPETER: 7, KANAL: 8, RENCE: 9, PODSKALA: 10,
}

/** Uradni razpored prvega dela, dom : gost. */
const URADNI: [string, string][][] = [
  [['PODSKALA','KRAS'],['RENCE','OREHOVLJE'],['KANAL','DESKLE'],['SEMPETER','GORICA'],['SOCA','HUBELJ']],
  [['SOCA','PODSKALA'],['HUBELJ','SEMPETER'],['GORICA','KANAL'],['DESKLE','RENCE'],['OREHOVLJE','KRAS']],
  [['PODSKALA','OREHOVLJE'],['KRAS','DESKLE'],['RENCE','GORICA'],['KANAL','HUBELJ'],['SEMPETER','SOCA']],
  [['SEMPETER','PODSKALA'],['SOCA','KANAL'],['HUBELJ','RENCE'],['GORICA','KRAS'],['DESKLE','OREHOVLJE']],
  [['PODSKALA','DESKLE'],['OREHOVLJE','GORICA'],['KRAS','HUBELJ'],['RENCE','SOCA'],['KANAL','SEMPETER']],
  [['KANAL','PODSKALA'],['SEMPETER','RENCE'],['SOCA','KRAS'],['HUBELJ','OREHOVLJE'],['GORICA','DESKLE']],
  [['PODSKALA','GORICA'],['DESKLE','HUBELJ'],['OREHOVLJE','SOCA'],['KRAS','SEMPETER'],['RENCE','KANAL']],
  [['RENCE','PODSKALA'],['KANAL','KRAS'],['SEMPETER','OREHOVLJE'],['SOCA','DESKLE'],['HUBELJ','GORICA']],
  [['PODSKALA','HUBELJ'],['GORICA','SOCA'],['DESKLE','SEMPETER'],['OREHOVLJE','KANAL'],['KRAS','RENCE']],
]

const EKIPE = Object.keys(ZREB).map(ime => ({ id: ime, draw_number: ZREB[ime] }))
const kljuc = (r: number, h: string, a: string) => `${r}: ${h} - ${a}`

describe('1. OBZL Nova Gorica 2026/27 — prvi del', () => {
  const razpored = bergerFixtures(EKIPE, false, true)

  it('9 kol, 45 tekem', () => {
    expect(razpored.length).toBe(45)
    expect(new Set(razpored.map(f => f.round_number)).size).toBe(SPLIT_PHASE1_ROUNDS)
  })

  it('se ujema z uradnim razporedom — vseh 45 tekem, vključno z dom/gost', () => {
    const dobljeno = razpored.map(f => kljuc(f.round_number, f.home_team_id, f.away_team_id)).sort()
    const pricakovano = URADNI.flatMap((krog, i) => krog.map(([h, a]) => kljuc(i + 1, h, a))).sort()
    expect(dobljeno).toEqual(pricakovano)
  })

  it('brez zrcaljenja bi bila vsaka tekma pri napačnem klubu', () => {
    const brez = bergerFixtures(EKIPE, false, false)
    const uradniPari = new Set(URADNI.flatMap((krog, i) => krog.map(([h, a]) => kljuc(i + 1, h, a))))
    const ujemanja = brez.filter(f => uradniPari.has(kljuc(f.round_number, f.home_team_id, f.away_team_id)))
    expect(ujemanja.length).toBe(0)   // ne nekatere — nobena
  })

  it('zrcaljenje obrne samo stran, parov in kol pa ne', () => {
    const par = (h: string, a: string) => [h, a].sort().join('|')
    const zrcalno = bergerFixtures(EKIPE, false, true).map(f => `${f.round_number}:${par(f.home_team_id, f.away_team_id)}`).sort()
    const navadno = bergerFixtures(EKIPE, false, false).map(f => `${f.round_number}:${par(f.home_team_id, f.away_team_id)}`).sort()
    expect(zrcalno).toEqual(navadno)
  })

  it('Podskala igra doma v lihih kolih, v gosteh v sodih', () => {
    for (const f of razpored.filter(x => x.home_team_id === 'PODSKALA' || x.away_team_id === 'PODSKALA')) {
      const doma = f.home_team_id === 'PODSKALA'
      expect(doma).toBe(f.round_number % 2 === 1)
    }
  })
})

describe('1. OBZL Nova Gorica 2026/27 — drugi del (play off)', () => {
  /** Uradni play off po mestih: [pari, prosti] za vsako od petih kol. */
  const URADNI_PLAYOFF: { pari: [number, number][]; prost: number }[] = [
    { pari: [[2, 5], [3, 4]], prost: 1 },
    { pari: [[5, 3], [1, 2]], prost: 4 },
    { pari: [[3, 1], [4, 5]], prost: 2 },
    { pari: [[1, 4], [2, 3]], prost: 5 },
    { pari: [[4, 2], [5, 1]], prost: 3 },
  ]

  it('pari in prosta ekipa se ujemajo v vseh petih kolih', () => {
    const razpored = bergerSchedule(5)
    for (let krog = 1; krog <= 5; krog++) {
      const igre = razpored.filter(g => g.round === krog)
      const pari = igre.map(g => [g.home, g.away].sort((a, b) => a - b).join(':')).sort()
      const uradni = URADNI_PLAYOFF[krog - 1]
      expect(pari).toEqual(uradni.pari.map(p => [...p].sort((a, b) => a - b).join(':')).sort())

      const igrajo = new Set(igre.flatMap(g => [g.home, g.away]))
      const prosti = [1, 2, 3, 4, 5].filter(n => !igrajo.has(n))
      expect(prosti).toEqual([uradni.prost])
    }
  })

  it('kola se nadaljujejo (10-14) in obe skupini imata enak vzorec', () => {
    const zgoraj = splitPhase2Fixtures(
      ['PODSKALA', 'KRAS', 'RENCE', 'OREHOVLJE', 'KANAL'].map((id, i) => ({ id, position: i + 1 })),
      SPLIT_TOP, SPLIT_PHASE1_ROUNDS + 1, bergerFixtures(EKIPE, false, true),
    )
    const spodaj = splitPhase2Fixtures(
      ['DESKLE', 'SEMPETER', 'GORICA', 'SOCA', 'HUBELJ'].map((id, i) => ({ id, position: i + 1 })),
      SPLIT_BOTTOM, SPLIT_PHASE1_ROUNDS + 1, bergerFixtures(EKIPE, false, true),
    )
    expect([...new Set(zgoraj.map(f => f.round_number))].sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14])
    expect(zgoraj.length).toBe(10)
    expect(spodaj.length).toBe(10)
  })

  it('dom/gost drugega dela se obrne glede na zrcaljeni prvi del', () => {
    const prviDel = bergerFixtures(EKIPE, false, true)
    const doma1 = new Map(prviDel.map(f => [[f.home_team_id, f.away_team_id].sort().join('|'), f.home_team_id]))
    const skupina = splitPhase2Fixtures(
      ['PODSKALA', 'KRAS', 'RENCE', 'OREHOVLJE', 'KANAL'].map((id, i) => ({ id, position: i + 1 })),
      SPLIT_TOP, 10, prviDel,
    )
    for (const f of skupina) {
      expect(doma1.get([f.home_team_id, f.away_team_id].sort().join('|'))).toBe(f.away_team_id)
    }
  })
})
