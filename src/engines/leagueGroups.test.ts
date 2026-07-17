import { describe, test, expect } from 'vitest'
import { phase2Fixtures, validateDraw, type Phase2Team } from './leagueGroups'

/**
 * Skupina '1-6', faza 2: vsaka ekipa igra samo s 3 ekipami iz DRUGE
 * skupine faze 1 (doma in v gosteh) — 2 ekipi iz lastne skupine se NE
 * igrata ponovno (rezultati iz faze 1 se prenesejo naprej).
 */

const groupA: Phase2Team[] = [
  { id: 'A1', position: 1 },
  { id: 'A2', position: 2 },
  { id: 'A3', position: 3 },
]
const groupB: Phase2Team[] = [
  { id: 'B1', position: 1 },
  { id: 'B2', position: 2 },
  { id: 'B3', position: 3 },
]

// za skupino '7-12' — pozicije 4..6, mapirane na 1..3 s strani klicatelja
const groupA456: Phase2Team[] = [
  { id: 'A4', position: 1 },
  { id: 'A5', position: 2 },
  { id: 'A6', position: 3 },
]
const groupB456: Phase2Team[] = [
  { id: 'B4', position: 1 },
  { id: 'B5', position: 2 },
  { id: 'B6', position: 3 },
]

describe('phase2Fixtures — skupina 1-6', () => {
  test('proizvede natanko 18 tekem', () => {
    const fixtures = phase2Fixtures(groupA, groupB, '1-6', 11)
    expect(fixtures).toHaveLength(18)
  })

  test('kroga so 11..16, ko faza 1 uporabi 10 krogov (startRound=11)', () => {
    const fixtures = phase2Fixtures(groupA, groupB, '1-6', 11)
    const rounds = [...new Set(fixtures.map(f => f.round_number))].sort((a, b) => a - b)
    expect(rounds).toEqual([11, 12, 13, 14, 15, 16])
  })

  test('vsaka ekipa igra vsakega od 3 nasprotnikov iz druge skupine natanko dvakrat (1x doma, 1x v gosteh)', () => {
    const fixtures = phase2Fixtures(groupA, groupB, '1-6', 11)
    for (const a of groupA) {
      for (const b of groupB) {
        const homeGames = fixtures.filter(f => f.home_team_id === a.id && f.away_team_id === b.id)
        const awayGames = fixtures.filter(f => f.home_team_id === b.id && f.away_team_id === a.id)
        expect(homeGames, `${a.id} doma proti ${b.id}`).toHaveLength(1)
        expect(awayGames, `${b.id} doma proti ${a.id}`).toHaveLength(1)
      }
    }
  })

  test('nič tekem med ekipami iz iste skupine faze 1 (ključna lastnost)', () => {
    const fixtures = phase2Fixtures(groupA, groupB, '1-6', 11)
    const groupAIds = new Set(groupA.map(t => t.id))
    const groupBIds = new Set(groupB.map(t => t.id))
    for (const f of fixtures) {
      const bothInA = groupAIds.has(f.home_team_id) && groupAIds.has(f.away_team_id)
      const bothInB = groupBIds.has(f.home_team_id) && groupBIds.has(f.away_team_id)
      expect(bothInA, `${f.home_team_id} vs ${f.away_team_id} sta oba iz skupine A`).toBe(false)
      expect(bothInB, `${f.home_team_id} vs ${f.away_team_id} sta oba iz skupine B`).toBe(false)
    }
  })

  test('razmerje dom/gost je 3:3 za vsako ekipo', () => {
    const fixtures = phase2Fixtures(groupA, groupB, '1-6', 11)
    for (const t of [...groupA, ...groupB]) {
      const home = fixtures.filter(f => f.home_team_id === t.id).length
      const away = fixtures.filter(f => f.away_team_id === t.id).length
      expect(home, `${t.id} doma`).toBe(3)
      expect(away, `${t.id} v gosteh`).toBe(3)
    }
  })

  test('krog 1 je natanko A1:B3, A2:B1, A3:B2 (dom:gost pomembno)', () => {
    const fixtures = phase2Fixtures(groupA, groupB, '1-6', 11)
    const round1 = fixtures.filter(f => f.round_number === 11)
      .map(f => `${f.home_team_id}:${f.away_team_id}`)
      .sort()
    expect(round1).toEqual(['A1:B3', 'A2:B1', 'A3:B2'].sort())
  })

  test('krogi 4-6 so natančen obrat (dom/gost zamenjan) krogov 1-3', () => {
    const fixtures = phase2Fixtures(groupA, groupB, '1-6', 11)
    for (let i = 0; i < 3; i++) {
      const firstRound = 11 + i
      const mirrorRound = 14 + i
      const firstGames = fixtures.filter(f => f.round_number === firstRound)
      const mirrorGames = fixtures.filter(f => f.round_number === mirrorRound)
      expect(mirrorGames).toHaveLength(firstGames.length)
      for (const g of firstGames) {
        const swapped = mirrorGames.find(m => m.home_team_id === g.away_team_id && m.away_team_id === g.home_team_id)
        expect(swapped, `krog ${mirrorRound} bi moral vsebovati obrnjeno ${g.home_team_id}:${g.away_team_id}`).toBeTruthy()
      }
    }
  })

  test('skupina 7-12 mapira pozicije 1->4, 2->5, 3->6: krog 1 je A4:B6, A5:B4, A6:B5', () => {
    const fixtures = phase2Fixtures(groupA456, groupB456, '7-12', 11)
    const round1 = fixtures.filter(f => f.round_number === 11)
      .map(f => `${f.home_team_id}:${f.away_team_id}`)
      .sort()
    expect(round1).toEqual(['A4:B6', 'A5:B4', 'A6:B5'].sort())
  })

  test('group_label je nastavljen pravilno na vsaki tekmi', () => {
    const fixtures = phase2Fixtures(groupA, groupB, '1-6', 11)
    for (const f of fixtures) expect(f.group_label).toBe('1-6')
  })

  test('vrže napako, če skupina A nima natanko 3 ekip', () => {
    const badA = [...groupA, { id: 'A9', position: 3 as const }]
    expect(() => phase2Fixtures(badA, groupB, '1-6', 11)).toThrow()
  })

  test('vrže napako, če skupina B nima natanko 3 ekip', () => {
    const badB = groupB.slice(0, 2)
    expect(() => phase2Fixtures(groupA, badB, '1-6', 11)).toThrow()
  })
})

describe('validateDraw — preverjanje žreba', () => {
  const okTeams = [
    { id: 't-a1', group_label: 'A', draw_number: 1 },
    { id: 't-a2', group_label: 'A', draw_number: 2 },
    { id: 't-a3', group_label: 'A', draw_number: 3 },
    { id: 't-a4', group_label: 'A', draw_number: 4 },
    { id: 't-a5', group_label: 'A', draw_number: 5 },
    { id: 't-a6', group_label: 'A', draw_number: 6 },
    { id: 't-b1', group_label: 'B', draw_number: 1 },
    { id: 't-b2', group_label: 'B', draw_number: 2 },
    { id: 't-b3', group_label: 'B', draw_number: 3 },
    { id: 't-b4', group_label: 'B', draw_number: 4 },
    { id: 't-b5', group_label: 'B', draw_number: 5 },
    { id: 't-b6', group_label: 'B', draw_number: 6 },
  ]

  test('6+6 ekip s pravilnimi številkami -> ni napak', () => {
    expect(validateDraw(okTeams)).toEqual([])
  })

  test('podvojena številka znotraj skupine -> napaka', () => {
    const teams = okTeams.map(t => t.id === 't-a2' ? { ...t, draw_number: 1 } : t)
    const errors = validateDraw(teams)
    expect(errors.length).toBeGreaterThan(0)
  })

  test('manjkajoča številka (luknja) -> napaka', () => {
    const teams = okTeams.map(t => t.id === 't-a6' ? { ...t, draw_number: 7 } : t)
    const errors = validateDraw(teams)
    expect(errors.length).toBeGreaterThan(0)
  })

  test('5 ekip v skupini -> napaka', () => {
    const teams = okTeams.filter(t => t.id !== 't-b6')
    const errors = validateDraw(teams)
    expect(errors.length).toBeGreaterThan(0)
  })

  test('ekipa brez skupine/številke -> napaka', () => {
    const teams = okTeams.map(t => t.id === 't-a1' ? { ...t, group_label: null, draw_number: null } : t)
    const errors = validateDraw(teams)
    expect(errors.length).toBeGreaterThan(0)
  })
})
