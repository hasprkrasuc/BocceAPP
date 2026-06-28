import { describe, test, expect } from 'vitest'
import { bergerSchedule, bergerFixtures, MAX_BERGER_TEAMS } from './berger'

/**
 * Pričakovane Bergerjeve tabele iz Priloge B (BZS).
 * Vsaka igra je [home, away] z 1-indeksiranimi številkami žreba.
 * Vrstni red iger znotraj kroga ni pomemben (primerjamo kot množice).
 */
const PRILOGA_B: Record<number, number[][][]> = {
  4: [
    [[1, 4], [2, 3]],
    [[4, 3], [1, 2]],
    [[2, 4], [3, 1]],
  ],
  6: [
    [[1, 6], [2, 5], [3, 4]],
    [[6, 4], [5, 3], [1, 2]],
    [[2, 6], [3, 1], [4, 5]],
    [[6, 5], [1, 4], [2, 3]],
    [[3, 6], [4, 2], [5, 1]],
  ],
  8: [
    [[1, 8], [2, 7], [3, 6], [4, 5]],
    [[8, 5], [6, 4], [7, 3], [1, 2]],
    [[2, 8], [3, 1], [4, 7], [5, 6]],
    [[8, 6], [7, 5], [1, 4], [2, 3]],
    [[3, 8], [4, 2], [5, 1], [6, 7]],
    [[8, 7], [1, 6], [2, 5], [3, 4]],
    [[4, 8], [5, 3], [6, 2], [7, 1]],
  ],
  10: [
    [[1, 10], [2, 9], [3, 8], [4, 7], [5, 6]],
    [[10, 6], [7, 5], [8, 4], [9, 3], [1, 2]],
    [[2, 10], [3, 1], [4, 9], [5, 8], [6, 7]],
    [[10, 7], [8, 6], [9, 5], [1, 4], [2, 3]],
    [[3, 10], [4, 2], [5, 1], [6, 9], [7, 8]],
    [[10, 8], [9, 7], [1, 6], [2, 5], [3, 4]],
    [[4, 10], [5, 3], [6, 2], [7, 1], [8, 9]],
    [[10, 9], [1, 8], [2, 7], [3, 6], [4, 5]],
    [[5, 10], [6, 4], [7, 3], [8, 2], [9, 1]],
  ],
  12: [
    [[1, 12], [2, 11], [3, 10], [4, 9], [5, 8], [6, 7]],
    [[12, 7], [8, 6], [9, 5], [10, 4], [11, 3], [1, 2]],
    [[2, 12], [3, 1], [4, 11], [5, 10], [6, 9], [7, 8]],
    [[12, 8], [9, 7], [10, 6], [11, 5], [1, 4], [2, 3]],
    [[3, 12], [4, 2], [5, 1], [6, 11], [7, 10], [8, 9]],
    [[12, 9], [10, 8], [11, 7], [1, 6], [2, 5], [3, 4]],
    [[4, 12], [5, 3], [6, 2], [7, 1], [8, 11], [9, 10]],
    [[12, 10], [11, 9], [1, 8], [2, 7], [3, 6], [4, 5]],
    [[5, 12], [6, 4], [7, 3], [8, 2], [9, 1], [10, 11]],
    [[12, 11], [1, 10], [2, 9], [3, 8], [4, 7], [5, 6]],
    [[6, 12], [7, 5], [8, 4], [9, 3], [10, 2], [11, 1]],
  ],
}

/** Igre danega kroga kot množica nizov "home-away" za primerjavo neodvisno od vrstnega reda. */
function roundSet(games: { home: number; away: number }[]): Set<string> {
  return new Set(games.map(g => `${g.home}-${g.away}`))
}

describe('bergerSchedule — točno ujemanje s Prilogo B', () => {
  for (const evenN of [4, 6, 8, 10, 12]) {
    test(`${evenN} ekip ustreza Bergerjevi tabeli (krogi + dom/gost)`, () => {
      const games = bergerSchedule(evenN, false)
      const expected = PRILOGA_B[evenN]
      // pravilno število krogov
      const rounds = new Set(games.map(g => g.round))
      expect(rounds.size).toBe(evenN - 1)
      // vsak krog se ujema kot množica iger
      for (let r = 1; r <= evenN - 1; r++) {
        const got = roundSet(games.filter(g => g.round === r))
        const want = new Set(expected[r - 1].map(([h, a]) => `${h}-${a}`))
        expect(got, `krog ${r} (${evenN} ekip)`).toEqual(want)
      }
    })
  }
})

describe('bergerSchedule — lastnosti round-robina', () => {
  for (const n of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    test(`${n} ekip: vsak par se sreča natanko enkrat (enokrožno)`, () => {
      const games = bergerSchedule(n, false)
      const seen = new Map<string, number>()
      for (const g of games) {
        const key = [g.home, g.away].sort((a, b) => a - b).join('-')
        seen.set(key, (seen.get(key) ?? 0) + 1)
        // številke v veljavnem obsegu
        expect(g.home).toBeGreaterThanOrEqual(1)
        expect(g.away).toBeGreaterThanOrEqual(1)
        expect(g.home).toBeLessThanOrEqual(n)
        expect(g.away).toBeLessThanOrEqual(n)
        expect(g.home).not.toBe(g.away)
      }
      const expectedPairs = (n * (n - 1)) / 2
      expect(seen.size).toBe(expectedPairs)
      for (const [, count] of seen) expect(count).toBe(1)
    })
  }

  test('sodo število ekip: vsak krog je popolna razporeditev (vse ekipe igrajo)', () => {
    const games = bergerSchedule(8, false)
    for (let r = 1; r <= 7; r++) {
      const teams = games.filter(g => g.round === r).flatMap(g => [g.home, g.away])
      expect(new Set(teams).size).toBe(8)
    }
  })
})

describe('bergerSchedule — liho število ekip (počitek)', () => {
  test('5 ekip: 5 krogov, vsaka ekipa počiva natanko enkrat', () => {
    const games = bergerSchedule(5, false)
    const rounds = new Set(games.map(g => g.round))
    expect(rounds.size).toBe(5) // tabela za 6 ekip ima 5 krogov
    // v vsakem krogu igrajo 4 ekipe (2 igri), 1 počiva
    const byeCount = new Map<number, number>()
    for (let r = 1; r <= 5; r++) {
      const playing = games.filter(g => g.round === r).flatMap(g => [g.home, g.away])
      expect(playing.length).toBe(4)
      const resting = [1, 2, 3, 4, 5].filter(t => !playing.includes(t))
      expect(resting.length).toBe(1)
      byeCount.set(resting[0], (byeCount.get(resting[0]) ?? 0) + 1)
    }
    for (const t of [1, 2, 3, 4, 5]) expect(byeCount.get(t)).toBe(1)
  })
})

describe('bergerSchedule — dvokrožno', () => {
  test('6 ekip dvokrožno: 10 krogov, vsak par dvakrat z zamenjanim dom/gost', () => {
    const single = bergerSchedule(6, false)
    const double = bergerSchedule(6, true)
    expect(new Set(double.map(g => g.round)).size).toBe(10)
    // drugi krog je zrcalna slika prvega s zamenjanim dom/gost
    for (const g of single) {
      const mirror = double.find(
        d => d.round === g.round + 5 && d.home === g.away && d.away === g.home,
      )
      expect(mirror, `zrcalo za ${g.home}-${g.away} v krogu ${g.round}`).toBeTruthy()
    }
    // vsak urejeni par (dom,gost) se v sezoni pojavi natanko enkrat
    const ordered = new Set(double.map(g => `${g.home}-${g.away}`))
    expect(ordered.size).toBe(double.length)
  })
})

describe('bergerFixtures — preslikava žrebanih številk v ID-je ekip', () => {
  const teams4 = [
    { id: 'A', draw_number: 1 },
    { id: 'B', draw_number: 2 },
    { id: 'C', draw_number: 3 },
    { id: 'D', draw_number: 4 },
  ]

  test('preslika dom/gost po žrebani številki (1. krog 4 ekip)', () => {
    const fx = bergerFixtures(teams4, false)
    const r1 = new Set(
      fx.filter(f => f.round_number === 1).map(f => `${f.home_team_id}-${f.away_team_id}`),
    )
    // Priloga B, 4 ekipe, 1. krog: 1-4, 2-3  →  A-D, B-C
    expect(r1).toEqual(new Set(['A-D', 'B-C']))
  })

  test('preslikava sledi žrebani številki, ne vrstnemu redu v seznamu', () => {
    const scrambled = [
      { id: 'D', draw_number: 4 },
      { id: 'A', draw_number: 1 },
      { id: 'C', draw_number: 3 },
      { id: 'B', draw_number: 2 },
    ]
    const fx = bergerFixtures(scrambled, false)
    const r1 = new Set(
      fx.filter(f => f.round_number === 1).map(f => `${f.home_team_id}-${f.away_team_id}`),
    )
    expect(r1).toEqual(new Set(['A-D', 'B-C']))
  })

  test('dvokrožno podvoji število tekem', () => {
    const single = bergerFixtures(teams4, false)
    const double = bergerFixtures(teams4, true)
    expect(double.length).toBe(single.length * 2)
  })

  test('manjkajoča žrebana številka vrže napako', () => {
    const bad = [
      { id: 'A', draw_number: 1 },
      { id: 'B', draw_number: null },
      { id: 'C', draw_number: 3 },
    ]
    expect(() => bergerFixtures(bad, false)).toThrow(/žreb/i)
  })

  test('podvojena žrebana številka vrže napako', () => {
    const bad = [
      { id: 'A', draw_number: 1 },
      { id: 'B', draw_number: 2 },
      { id: 'C', draw_number: 2 },
    ]
    expect(() => bergerFixtures(bad, false)).toThrow(/žreb/i)
  })

  test('žrebane številke morajo biti zaporedne 1..N', () => {
    const bad = [
      { id: 'A', draw_number: 1 },
      { id: 'B', draw_number: 2 },
      { id: 'C', draw_number: 3 },
      { id: 'D', draw_number: 5 },
    ]
    expect(() => bergerFixtures(bad, false)).toThrow(/žreb/i)
  })
})

describe('bergerSchedule — meje', () => {
  test('manj kot 2 ekipi vrže napako', () => {
    expect(() => bergerSchedule(1, false)).toThrow()
  })
  test(`več kot ${MAX_BERGER_TEAMS} ekip vrže napako z jasno informacijo`, () => {
    expect(() => bergerSchedule(MAX_BERGER_TEAMS + 1, false)).toThrow(/Bergerjev/i)
  })
})
