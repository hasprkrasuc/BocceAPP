import { describe, test, expect } from 'vitest'
import {
  pariPrvegaKroga, pokalniPajek, prostiVPrvemKrogu, tekmePrvegaKroga,
  pokalniDomacin, pokalneUvrstitve, rangLige, POKAL_VELIKOST, RANG_NEZNAN,
  type PokalEkipa, type PokalIzid,
} from './pokal'

/**
 * Preizkusi tečejo na PRAVEM žrebu Pokala BZS 2026/27 — 47 ekip na 64 mestih,
 * kot je bil opravljen in zapisan v pripravi žreba. Izmišljen primer bi
 * preveril samo aritmetiko; ta preveri, da se izpeljani pari ujemajo s tistimi,
 * ki jih je zveza objavila.
 */
const ZREB: Array<[string, number]> = [
  ['QAP Postojna', 1], ['Dragomer', 3], ['Cesta', 4], ['Loka 1000', 5],
  ['Gradna GIK Obrov', 8], ['Planina Ajdovščina', 9], ['Begunje', 11], ['Hoče', 12],
  ['Svoboda', 13], ['Trta Sveti Anton', 14], ['Marjetica Koper', 16], ['Hrast Kobjeglava', 17],
  ['Kozlek Zabiče', 19], ['Budničar', 20], ['Goriška Brda', 21], ['Košana 2', 22],
  ['Tržič Orodjarstvo Knific', 24], ['Jadran Izola', 25], ['Antena Portorož', 27], ['Košana', 28],
  ['Bistrica pri Tržiču', 29], ['Postojna', 30], ['Trata Škofja Loka', 32],
  ['Termoplasti Plama Ilirska Bistrica', 33], ['Zarja', 35], ['Krško', 36], ['Nanos', 37],
  ['Cerkniško jezero', 38], ['Mengeš Rakoll', 40], ['Čirče Van Den', 41], ['Katarina', 43],
  ['Sodražica', 44], ['Sodček', 45], ['Tabor Ozeljan', 46], ['Zabiče Kozlek', 48],
  ['Orlek Oro Met Pivka', 49], ['Tabor Ihan', 51], ['Hubelj', 52], ['Rogovila', 53],
  ['Šiška', 54], ['Velenje Premogovnik', 56], ['Pliskovica', 57], ['Kolektor Idrija', 59],
  ['Koseze', 60], ['Logatec', 61], ['Breza', 62], ['Skala Sežana', 64],
]
const ekipe: PokalEkipa[] = ZREB.map(([teamId, drawNumber]) => ({ teamId, drawNumber }))

/** 16 nosilcev z določenimi številkami + Loka 1000, ki je dobila 17. prosto mesto. */
const NOSILCI = [
  'QAP Postojna', 'Skala Sežana', 'Termoplasti Plama Ilirska Bistrica', 'Trata Škofja Loka',
  'Zabiče Kozlek', 'Hrast Kobjeglava', 'Orlek Oro Met Pivka', 'Marjetica Koper',
  'Planina Ajdovščina', 'Velenje Premogovnik', 'Tržič Orodjarstvo Knific', 'Čirče Van Den',
  'Jadran Izola', 'Mengeš Rakoll', 'Pliskovica', 'Gradna GIK Obrov',
]

describe('žreb Pokala BZS 2026/27', () => {
  test('47 ekip da 15 tekem in 17 prostih mest', () => {
    expect(ekipe).toHaveLength(47)
    expect(tekmePrvegaKroga(ekipe)).toHaveLength(15)
    expect(prostiVPrvemKrogu(ekipe)).toHaveLength(17)
    // 15 tekem × 2 ekipi + 17 prostih = 47.
    expect(15 * 2 + 17).toBe(47)
  })

  test('pari 1. kroga so natanko tisti iz priprave žreba', () => {
    expect(tekmePrvegaKroga(ekipe)).toEqual([
      ['Dragomer', 'Cesta'],
      ['Begunje', 'Hoče'],
      ['Svoboda', 'Trta Sveti Anton'],
      ['Kozlek Zabiče', 'Budničar'],
      ['Goriška Brda', 'Košana 2'],
      ['Antena Portorož', 'Košana'],
      ['Bistrica pri Tržiču', 'Postojna'],
      ['Zarja', 'Krško'],
      ['Nanos', 'Cerkniško jezero'],
      ['Katarina', 'Sodražica'],
      ['Sodček', 'Tabor Ozeljan'],
      ['Tabor Ihan', 'Hubelj'],
      ['Rogovila', 'Šiška'],
      ['Kolektor Idrija', 'Koseze'],
      ['Logatec', 'Breza'],
    ])
  })

  test('vseh 16 nosilcev je v 1. krogu prostih', () => {
    const prosti = new Set(prostiVPrvemKrogu(ekipe))
    for (const n of NOSILCI) {
      expect(prosti.has(n), `${n} je nosilec in bi moral biti prost`).toBe(true)
    }
    // 17. prosto mesto je pripadlo Loki 1000 (8. prvoligaš po lanski lestvici).
    expect(prosti.has('Loka 1000')).toBe(true)
    expect(prosti.size).toBe(17)
  })

  test('prvoligaš v 1. krogu ne igra proti prvoligašu', () => {
    const PRVA_LIGA = new Set([
      'Velenje Premogovnik', 'Tržič Orodjarstvo Knific', 'Čirče Van Den', 'Jadran Izola',
      'Mengeš Rakoll', 'Pliskovica', 'Gradna GIK Obrov', 'Loka 1000', 'Košana',
      'Goriška Brda', 'Kozlek Zabiče', 'Sodražica',
    ])
    for (const [a, b] of tekmePrvegaKroga(ekipe)) {
      expect(PRVA_LIGA.has(a) && PRVA_LIGA.has(b), `${a} – ${b} sta oba prvoligaša`).toBe(false)
    }
  })

  test('nosilca 1 in 2 se lahko srečata šele v finalu', () => {
    // Mesti 1 in 64 sta v nasprotnih polovicah pajka.
    const prvi = ekipe.find(e => e.teamId === 'QAP Postojna')!.drawNumber
    const drugi = ekipe.find(e => e.teamId === 'Skala Sežana')!.drawNumber
    expect(prvi).toBe(1)
    expect(drugi).toBe(POKAL_VELIKOST)
  })

  test('pajek ima 32 tekem prvega kroga in se konča s finalom', () => {
    const pajek = pokalniPajek(ekipe)
    expect(pajek.filter(m => m.stage === 'r64')).toHaveLength(32)
    expect(pajek.filter(m => m.stage === 'final')).toHaveLength(1)
    // Pokal nima tekme za 3. mesto.
    expect(pajek.some(m => m.stage === 'third_place')).toBe(false)
  })

  test('prosti napredujejo brez tekme, 17 ekip je v 2. krogu že znanih', () => {
    const pajek = pokalniPajek(ekipe)
    const drugiKrog = pajek.filter(m => m.stage === 'r32')
    expect(drugiKrog).toHaveLength(16)
    const znane = drugiKrog.flatMap(m => [m.teamA, m.teamB]).filter(Boolean)
    expect(znane).toHaveLength(17)
    expect(znane).toContain('QAP Postojna')
    expect(znane).toContain('Loka 1000')
  })
})

describe('napredovanje po izidih', () => {
  test('zmagovalec tekme 1. kroga pride v 2. krog k pravemu nasprotniku', () => {
    const pajek = pokalniPajek(ekipe, [
      { homeTeamId: 'Dragomer', awayTeamId: 'Cesta', winnerTeamId: 'Cesta' },
    ])
    // Mesti 3 in 4 sta v isti tekmi 2. kroga kot prosto mesto 1–2 (QAP Postojna).
    const tekma = pajek.find(m => m.stage === 'r32' && [m.teamA, m.teamB].includes('Cesta'))
    expect(tekma).toBeDefined()
    expect([tekma!.teamA, tekma!.teamB].sort()).toEqual(['Cesta', 'QAP Postojna'])
  })

  test('zmagovalci se prelivajo čez več krogov', () => {
    const pajek = pokalniPajek(ekipe, [
      { homeTeamId: 'Dragomer', awayTeamId: 'Cesta', winnerTeamId: 'Cesta' },
      { homeTeamId: 'QAP Postojna', awayTeamId: 'Cesta', winnerTeamId: 'QAP Postojna' },
      { homeTeamId: 'Begunje', awayTeamId: 'Hoče', winnerTeamId: 'Hoče' },
      { homeTeamId: 'Loka 1000', awayTeamId: 'Hoče', winnerTeamId: 'Loka 1000' },
      { homeTeamId: 'QAP Postojna', awayTeamId: 'Loka 1000', winnerTeamId: 'QAP Postojna' },
    ])
    const r16 = pajek.filter(m => m.stage === 'r16')
    expect(r16.some(m => [m.teamA, m.teamB].includes('QAP Postojna'))).toBe(true)
  })

  test('neodigrana tekma ne premakne nikogar naprej', () => {
    const pajek = pokalniPajek(ekipe, [
      { homeTeamId: 'Dragomer', awayTeamId: 'Cesta', winnerTeamId: null },
    ])
    const tekma = pajek.find(m => m.stage === 'r32' && m.teamA === 'QAP Postojna')!
    expect(tekma.teamB).toBeNull()
  })

  test('vrstni red domači/gostje na izid ne vpliva', () => {
    const obrnjeno = pokalniPajek(ekipe, [
      { homeTeamId: 'Cesta', awayTeamId: 'Dragomer', winnerTeamId: 'Dragomer' },
    ])
    const tekma = obrnjeno.find(m => m.stage === 'r32' && [m.teamA, m.teamB].includes('Dragomer'))
    expect(tekma).toBeDefined()
  })
})

describe('napake v žrebu se ujamejo', () => {
  test('dve ekipi z isto številko', () => {
    expect(() => pariPrvegaKroga([
      { teamId: 'A', drawNumber: 5 }, { teamId: 'B', drawNumber: 5 },
    ])).toThrow(/dvakrat/)
  })

  test('številka zunaj razpona', () => {
    expect(() => pariPrvegaKroga([{ teamId: 'A', drawNumber: 65 }])).toThrow(/zunaj razpona/)
    expect(() => pariPrvegaKroga([{ teamId: 'A', drawNumber: 0 }])).toThrow(/zunaj razpona/)
  })

  test('več ekip kot mest', () => {
    const preveč = Array.from({ length: 5 }, (_, i) => ({ teamId: `E${i}`, drawNumber: i + 1 }))
    expect(() => pariPrvegaKroga(preveč, 4)).toThrow(/več kot mest/)
  })

  test('velikost, ki ni potenca dvojke', () => {
    expect(() => pariPrvegaKroga([{ teamId: 'A', drawNumber: 1 }], 47)).toThrow(/potenca/)
  })
})

describe('končna uvrstitev pokala', () => {
  // Mali pajek z 8 mesti: 1-2, 3-4, 5-6, 7-8 → polfinala → finale.
  const male: PokalEkipa[] = Array.from({ length: 8 }, (_, i) => ({ teamId: `E${i + 1}`, drawNumber: i + 1 }))
  const zmaga = (a: string, b: string): PokalIzid => ({ homeTeamId: a, awayTeamId: b, winnerTeamId: a })

  test('zmagovalec finala 1., poraženec 2., polfinalna poraženca si delita 3.', () => {
    const pajek = pokalniPajek(male, [
      zmaga('E1', 'E2'), zmaga('E3', 'E4'), zmaga('E5', 'E6'), zmaga('E7', 'E8'),
      zmaga('E1', 'E3'), zmaga('E7', 'E5'),
      zmaga('E7', 'E1'),
    ], 8)
    const mesta = pokalneUvrstitve(pajek)
    expect(mesta.get('E7')).toBe(1)
    expect(mesta.get('E1')).toBe(2)
    expect(mesta.get('E3')).toBe(3)
    expect(mesta.get('E5')).toBe(3)
    // Četrtfinalni poraženci mesta nimajo.
    expect(mesta.size).toBe(4)
  })

  test('dokler finale ni odigran, ni nobenega mesta', () => {
    const pajek = pokalniPajek(male, [
      zmaga('E1', 'E2'), zmaga('E3', 'E4'), zmaga('E5', 'E6'), zmaga('E7', 'E8'),
      zmaga('E1', 'E3'), zmaga('E7', 'E5'),
    ], 8)
    expect(pokalneUvrstitve(pajek).size).toBe(0)
  })
})

describe('domačin pokalne tekme', () => {
  test('rang članskih lig: Super liga 1, 1. liga 2, obe 2. ligi 3, OBZ 4', () => {
    expect(rangLige('super_liga', 'men')).toBe(1)
    expect(rangLige('1_liga', 'men')).toBe(2)
    expect(rangLige('2_liga_vzhod', 'men')).toBe(3)
    expect(rangLige('2_liga_zahod', 'men')).toBe(3)
    expect(rangLige('obz', 'men')).toBe(4)
  })

  test('ženske in mladinske lige ranga ne določajo', () => {
    // Pokal je člansko tekmovanje — ekipa v ženski Super ligi kluba ne
    // naredi »prvoligaškega« za moški pokal.
    expect(rangLige('super_liga', 'women')).toBeNull()
    expect(rangLige('obz', 'u18')).toBeNull()
    expect(rangLige('obz', 'u14')).toBeNull()
  })

  test('sezona brez ranga (pokal, neznan tier) ne določa ranga', () => {
    expect(rangLige(null, 'men')).toBeNull()
    expect(rangLige('karkoli', 'men')).toBeNull()
  })

  test('nižje rangirana ekipa je domačin, ne glede na žrebni vrstni red', () => {
    const rang = new Map([['superligaš', 1], ['območni', 4]])
    expect(pokalniDomacin('superligaš', 'območni', rang)).toEqual(['območni', 'superligaš'])
    expect(pokalniDomacin('območni', 'superligaš', rang)).toEqual(['območni', 'superligaš'])
  })

  test('pri enakem rangu ostane žrebni vrstni red', () => {
    const rang = new Map([['A', 3], ['B', 3]])
    expect(pokalniDomacin('A', 'B', rang)).toEqual(['A', 'B'])
    expect(pokalniDomacin('B', 'A', rang)).toEqual(['B', 'A'])
  })

  test('ekipa brez ranga šteje kot najnižja in je domačin', () => {
    const rang = new Map([['prvoligaš', 2]])
    expect(RANG_NEZNAN).toBeGreaterThan(4)
    expect(pokalniDomacin('prvoligaš', 'neznan', rang)).toEqual(['neznan', 'prvoligaš'])
    // Dve neznani: oba RANG_NEZNAN, ostane žrebni vrstni red.
    expect(pokalniDomacin('X', 'Y', rang)).toEqual(['X', 'Y'])
  })
})

describe('pokalna sezona ne sme uiti med lige', () => {
  // Pokal je `league_seasons` z drugim formatom, zato ga vsaka poizvedba čez
  // sezone potegne zraven, če je ne omejiš. Na seznamu lig bi se pokazal kot
  // liga brez lestvice. (V rang lestvico pokal od zdaj šteje NAMENOMA, s
  // koeficientom LIGA_KOEF.pokal — tam omejitve ne sme biti.)
  const viri = import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

  test('../pages/League.tsx izpušča pokalne sezone', () => {
    const vsebina = viri['../pages/League.tsx']
    expect(vsebina, 'datoteke ../pages/League.tsx ni med prebranimi').toBeDefined()
    expect(vsebina, "seznam državnih lig ne izpušča pokala — dodaj .neq('format', 'pokal')")
      .toMatch(/\.neq\(\s*['"]format['"]\s*,\s*['"]pokal['"]\s*\)/)
  })

  test('rang lestvica pokal vključuje (koeficient 1)', () => {
    const vsebina = viri['../lib/rangLestvica.ts']
    expect(vsebina, 'datoteke ../lib/rangLestvica.ts ni med prebranimi').toBeDefined()
    expect(vsebina, 'rang lestvica ne sme izpuščati pokala — pokal šteje s koeficientom 1')
      .not.toMatch(/\.neq\(\s*['"]format['"]\s*,\s*['"]pokal['"]\s*\)/)
    expect(vsebina).toMatch(/'pokal'/)
  })
})
