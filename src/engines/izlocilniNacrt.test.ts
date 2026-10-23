import { describe, test, expect } from 'vitest'
import {
  nacrtIzlocilnih, kljucMesta, razberiMesto, oznakaMesta,
  napredovalciPoMestih, izpisMesta, pripravljenostIzlocilnih,
  type SkupinaNacrta,
} from './izlocilniNacrt'
import type { GroupSize } from '../types'

/** N skupin dane velikosti, oštevilčenih od 1. */
const skupine = (n: number, velikost: GroupSize = 4): SkupinaNacrta[] =>
  Array.from({ length: n }, (_, i) => ({ stevilka: i + 1, velikost }))

describe('ključ in oznaka mesta', () => {
  test('ključ in nazaj', () => {
    expect(kljucMesta({ skupina: 3, mesto: 1 })).toBe('S3:1')
    expect(razberiMesto('S3:1')).toEqual({ skupina: 3, mesto: 1 })
    expect(razberiMesto('S12:2')).toEqual({ skupina: 12, mesto: 2 })
  })

  test('pravi id ekipe ni ključ mesta', () => {
    // Po mreži potujejo tudi pravi id-ji; razberiMesto jih ne sme razglasiti
    // za mesto skupine.
    expect(razberiMesto('9eaa0931-63fc-48fe-9842-d3359645129a')).toBe(null)
    expect(razberiMesto('S3')).toBe(null)
    expect(razberiMesto('S3:3')).toBe(null)
    expect(razberiMesto(null)).toBe(null)
    expect(razberiMesto('')).toBe(null)
  })

  test('oznaka loči zmagovalca od drugouvrščenega', () => {
    expect(oznakaMesta({ skupina: 3, mesto: 1 })).toBe('Zmagovalec S3')
    expect(oznakaMesta({ skupina: 3, mesto: 2 })).toBe('2. mesto S3')
  })
})

describe('brez predkola (število skupin je potenca 2)', () => {
  test('dve skupini dasta polfinale po križanju', () => {
    const n = nacrtIzlocilnih(skupine(2))
    expect(n.napovedljivo).toBe(true)
    expect(n.jePredkolo).toBe(false)
    const prvi = n.tekme.filter(t => t.stage === 'sf')
    expect(prvi).toHaveLength(2)
    // Križanje: zmagovalec S1 proti drugemu S2, zmagovalec S2 proti drugemu S1.
    expect([prvi[0].teamA, prvi[0].teamB]).toEqual(['S1:1', 'S2:2'])
    expect([prvi[1].teamA, prvi[1].teamB]).toEqual(['S2:1', 'S1:2'])
  })

  test('prvi in drugi IZ ISTE skupine sta v nasprotnih polovicah', () => {
    // To je posledica pravila, ki ga je potrdil lastnik: srečata se lahko
    // šele v finalu. Test to pripne, ker je iz kode samo po sebi nevidno.
    const n = nacrtIzlocilnih(skupine(8))
    const prvi = n.tekme.filter(t => t.stage === 'r16')
    expect(prvi).toHaveLength(8)
    const polovica = (kljuc: string) => {
      const i = prvi.findIndex(t => t.teamA === kljuc || t.teamB === kljuc)
      return i < prvi.length / 2 ? 'zgoraj' : 'spodaj'
    }
    for (let s = 1; s <= 8; s++) {
      expect(polovica(`S${s}:1`), `skupina ${s}`).not.toBe(polovica(`S${s}:2`))
    }
  })

  test('osem skupin da križanje W1–R8, W2–R7 …', () => {
    const prvi = nacrtIzlocilnih(skupine(8)).tekme.filter(t => t.stage === 'r16')
    expect(prvi.map(t => [t.teamA, t.teamB])).toEqual([
      ['S1:1', 'S8:2'], ['S2:1', 'S7:2'], ['S3:1', 'S6:2'], ['S4:1', 'S5:2'],
      ['S5:1', 'S4:2'], ['S6:1', 'S3:2'], ['S7:1', 'S2:2'], ['S8:1', 'S1:2'],
    ])
  })

  test('vsako mesto nastopi natanko enkrat', () => {
    for (const g of [2, 4, 8, 16]) {
      const prvi = nacrtIzlocilnih(skupine(g)).tekme.filter(t => !t.isBye)
      const mesta = prvi.flatMap(t => [t.teamA, t.teamB]).filter(Boolean)
      const pricakovana = skupine(g).flatMap(s => [`S${s.stevilka}:1`, `S${s.stevilka}:2`])
      expect([...new Set(mesta)].sort()).toEqual([...pricakovana].sort())
    }
  })

  test('tekme za 3. mesto načrt ne obljublja', () => {
    // Ali bo obstajala, odloči admin ob ustvarjanju in se nikamor ne shrani.
    const n = nacrtIzlocilnih(skupine(4))
    expect(n.tekme.some(t => t.stage === 'third_place')).toBe(false)
  })
})

describe('s predkolom (število skupin ni potenca 2)', () => {
  /** Tri skupine: ena po 4 (direktna) in dve po 3 (dodatni, igrata predkolo). */
  const tri: SkupinaNacrta[] = [
    { stevilka: 1, velikost: 4 },
    { stevilka: 2, velikost: 3 },
    { stevilka: 3, velikost: 3 },
  ]

  test('prepozna predkolo', () => {
    const n = nacrtIzlocilnih(tri)
    expect(n.napovedljivo).toBe(true)
    expect(n.jePredkolo).toBe(true)
  })

  test('direktna ekipa ima prosti prehod in je v 2. krogu znana TAKOJ', () => {
    // Prav to je past, ki bi pri večini DP polovico mreže označila nesmiselno:
    // brez razrešitve prostih prehodov bi tam pisalo »zmagovalec proste tekme«.
    const n = nacrtIzlocilnih(tri)
    const proste = n.tekme.filter(t => t.isBye)
    expect(proste.length, 'direktne skupine morajo imeti prosti prehod').toBeGreaterThan(0)

    // Mesta direktne skupine morajo biti vpisana v krogu ZA predkolom.
    const krogi = [...new Set(n.tekme.map(t => t.stage))]
    const zadnji = n.tekme.filter(t => t.stage === krogi[krogi.length - 1])
    const vsaMesta = n.tekme.flatMap(t => [t.teamA, t.teamB])
    expect(vsaMesta).toContain('S1:1')
    expect(vsaMesta).toContain('S1:2')
    expect(zadnji.length).toBeGreaterThan(0)
  })

  test('predtekme igrajo samo napredovalci skupin po 3', () => {
    const n = nacrtIzlocilnih(tri)
    const predkolo = n.tekme.filter(t => !t.isBye && t.teamA && t.teamB)
      .filter(t => t.stage === n.tekme[0].stage)
    for (const t of predkolo) {
      for (const k of [t.teamA, t.teamB]) {
        const m = razberiMesto(k)
        expect(m, `${k} ni mesto skupine`).not.toBe(null)
        expect([2, 3], `skupina ${m?.skupina} ni skupina po 3`).toContain(m!.skupina)
      }
    }
  })

  test('šest skupin: dve direktni po 4, štiri dodatne po 3', () => {
    const sest: SkupinaNacrta[] = [
      { stevilka: 1, velikost: 4 }, { stevilka: 2, velikost: 4 },
      { stevilka: 3, velikost: 3 }, { stevilka: 4, velikost: 3 },
      { stevilka: 5, velikost: 3 }, { stevilka: 6, velikost: 3 },
    ]
    const n = nacrtIzlocilnih(sest)
    expect(n.napovedljivo).toBe(true)
    expect(n.jePredkolo).toBe(true)
    // Vseh 12 mest mora nastopiti.
    const mesta = new Set(n.tekme.flatMap(t => [t.teamA, t.teamB]).filter(Boolean))
    for (const s of sest) {
      expect(mesta, `S${s.stevilka}:1`).toContain(`S${s.stevilka}:1`)
      expect(mesta, `S${s.stevilka}:2`).toContain(`S${s.stevilka}:2`)
    }
  })
})

describe('meje', () => {
  test('ena skupina ali nobena ne da načrta', () => {
    expect(nacrtIzlocilnih([]).napovedljivo).toBe(false)
    expect(nacrtIzlocilnih(skupine(1)).napovedljivo).toBe(false)
    expect(nacrtIzlocilnih([]).razlog).toMatch(/vsaj dve skupini/)
  })

  test('vrstni red vhoda ne vpliva na izid', () => {
    const naravnost = nacrtIzlocilnih(skupine(4))
    const obrnjeno = nacrtIzlocilnih([...skupine(4)].reverse())
    expect(obrnjeno.tekme).toEqual(naravnost.tekme)
  })

  test('načrt ne potrebuje nobenega rezultata', () => {
    // Celoten podpis sprejme samo številke in velikosti skupin — če bi kdaj
    // potreboval rezultat, bi se predogled nehal dati pokazati vnaprej.
    const n = nacrtIzlocilnih(skupine(4))
    expect(n.tekme.length).toBeGreaterThan(0)
    expect(n.tekme.every(t => t.winner === null || typeof t.winner === 'string')).toBe(true)
  })
})

describe('napredovalciPoMestih', () => {
  const skupine = [
    { id: 'g1', stevilka: 1, velikost: 4 as const },
    { id: 'g2', stevilka: 2, velikost: 5 as const },
  ]

  test('zmagovalec in drugouvrščeni iz pravih tekem', () => {
    // Skupina po 4: 1. mesto = zmagovalec tekme 3, 2. mesto = tekme 5.
    // Skupina po 5: tekmi 7 in 9. To pove GROUP_QUALIFIERS, ne ugibanje.
    const m = napredovalciPoMestih(skupine, [
      { group_id: 'g1', match_number: 3, winner_id: 'A' },
      { group_id: 'g1', match_number: 5, winner_id: 'B' },
      { group_id: 'g2', match_number: 7, winner_id: 'C' },
      { group_id: 'g2', match_number: 9, winner_id: 'D' },
    ])
    expect(m.get('S1:1')).toBe('A')
    expect(m.get('S1:2')).toBe('B')
    expect(m.get('S2:1')).toBe('C')
    expect(m.get('S2:2')).toBe('D')
  })

  test('druge tekme skupine ne štejejo', () => {
    // Tekma 1 je prva v skupini; njen zmagovalec še ni napredovalec.
    const m = napredovalciPoMestih(skupine, [
      { group_id: 'g1', match_number: 1, winner_id: 'A' },
      { group_id: 'g1', match_number: 4, winner_id: 'X' },
    ])
    expect(m.size).toBe(0)
  })

  test('neodigrana tekma ne da mesta', () => {
    const m = napredovalciPoMestih(skupine, [
      { group_id: 'g1', match_number: 3, winner_id: null },
    ])
    expect(m.has('S1:1')).toBe(false)
  })

  test('skupina po 5 ne uporabi številk skupine po 4', () => {
    // Past: tekma 3 v skupini po 5 ni napredovalna.
    const m = napredovalciPoMestih(skupine, [
      { group_id: 'g2', match_number: 3, winner_id: 'napacen' },
    ])
    expect(m.has('S2:1')).toBe(false)
  })
})

describe('izpisMesta', () => {
  const imena = new Map([['A', 'QAP Postojna']])
  const ime = (id: string) => imena.get(id)

  test('znano mesto izpiše ime ekipe', () => {
    const r = izpisMesta('S1:1', new Map([['S1:1', 'A']]), ime)
    expect(r).toEqual({ besedilo: 'QAP Postojna', znano: true })
  })

  test('neznano mesto izpiše oznako', () => {
    expect(izpisMesta('S3:1', new Map(), ime)).toEqual({ besedilo: 'Zmagovalec S3', znano: false })
    expect(izpisMesta('S3:2', new Map(), ime)).toEqual({ besedilo: '2. mesto S3', znano: false })
  })

  test('znan napredovalec brez imena pade nazaj na oznako', () => {
    // Ime pride iz vdelanih relacij skupinskih tekem; posodobitev v živo jih
    // ne prinese, zato se to zgodi. Bolje oznaka kot prazno.
    const r = izpisMesta('S1:1', new Map([['S1:1', 'neznan-id']]), ime)
    expect(r).toEqual({ besedilo: 'Zmagovalec S1', znano: false })
  })

  test('prazno mesto nima izpisa', () => {
    expect(izpisMesta(null, new Map(), ime)).toBe(null)
  })
})

describe('pripravljenostIzlocilnih', () => {
  const stiri = skupine(4)
  /** Vsi napredovalci štirih skupin. */
  const vsi = new Map(
    stiri.flatMap(s => [
      [`S${s.stevilka}:1`, `t${s.stevilka}a`],
      [`S${s.stevilka}:2`, `t${s.stevilka}b`],
    ] as Array<[string, string]>),
  )

  test('vsi znani — mrežo je varno ustvariti', () => {
    const p = pripravljenostIzlocilnih(stiri, vsi)
    expect(p.pripravljeno).toBe(true)
    expect(p.manjkajo).toEqual([])
    expect(p.sporocilo).toBe('')
  })

  test('PRAVI PRIMER: 4 skupine, znana 2 napredovalca — zavrnjeno', () => {
    // Prav to je bilo v produkciji na DP Igra v krog 2026. Dve je potenca 2,
    // zato je staro preverjanje šlo skozi in bi zgradilo eno samo »finale«.
    const dva = new Map([['S1:1', 'a'], ['S1:2', 'b']])
    const p = pripravljenostIzlocilnih(stiri, dva)
    expect(p.pripravljeno).toBe(false)
    expect(p.manjkajo).toHaveLength(6)
    expect(p.sporocilo).toMatch(/znanih je 2 od 8/)
  })

  test('zavrne tudi, ko je znanih napredovalcev potenca 2', () => {
    // Osem skupin (16 pričakovanih), znanih 8 — past, ki jo je staro
    // preverjanje spustilo. Vmesna števila kot 6 ali 10 je ujelo že prej.
    const osem = skupine(8)
    const polovica = new Map(
      osem.slice(0, 4).flatMap(s => [
        [`S${s.stevilka}:1`, `w${s.stevilka}`],
        [`S${s.stevilka}:2`, `r${s.stevilka}`],
      ] as Array<[string, string]>),
    )
    expect(polovica.size, 'osem je potenca 2').toBe(8)
    const p = pripravljenostIzlocilnih(osem, polovica)
    expect(p.pripravljeno).toBe(false)
    expect(p.manjkajo).toHaveLength(8)
  })

  test('manjka en sam napredovalec', () => {
    const skoraj = new Map(vsi)
    skoraj.delete('S3:2')
    const p = pripravljenostIzlocilnih(stiri, skoraj)
    expect(p.pripravljeno).toBe(false)
    expect(p.manjkajo).toEqual([{ skupina: 3, mesto: 2 }])
    expect(p.sporocilo).toMatch(/2\. mesto S3/)
    expect(p.sporocilo).toMatch(/znanih je 7 od 8/)
  })

  test('manjkajoči so našteti po skupinah in mestih', () => {
    const p = pripravljenostIzlocilnih(stiri, new Map())
    expect(p.manjkajo.slice(0, 4)).toEqual([
      { skupina: 1, mesto: 1 }, { skupina: 1, mesto: 2 },
      { skupina: 2, mesto: 1 }, { skupina: 2, mesto: 2 },
    ])
  })

  test('dolg seznam se skrajša, da sporočilo ostane berljivo', () => {
    const p = pripravljenostIzlocilnih(skupine(8), new Map())
    expect(p.manjkajo).toHaveLength(16)
    expect(p.sporocilo).toMatch(/in še 10\./)
  })

  test('manj kot dve skupini', () => {
    expect(pripravljenostIzlocilnih(skupine(1), new Map()).pripravljeno).toBe(false)
    expect(pripravljenostIzlocilnih([], new Map()).sporocilo).toMatch(/vsaj dve skupini/)
  })
})
