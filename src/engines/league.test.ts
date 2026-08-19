import { describe, it, expect } from 'vitest'
import { calculateStandings, calculateSplitStandings } from './league'
import type { LeagueTeam, LeagueFixture, LeagueSeason, LeagueMatchResult, LeagueMatchDisciplineResult } from '../types'

const makeSeason = (overrides?: Partial<LeagueSeason>): LeagueSeason => ({
  id: 's1', name: 'Test', year: 2025, category: 'men',
  status: 'active', tier: 'super_liga', obz_name: null, rounds_count: 99,
  win_points: 2, draw_points: 1, loss_points: 0, format: 'flat',
  berger_mirror: false, double_round: false,
  ...overrides,
})

const makeTeam = (id: string, name: string): LeagueTeam => ({
  id, season_id: 's1', club_name: name, short_name: null, captain_id: null,
  draw_number: null, group_label: null, shared_venue_key: null,
})

const makeFixture = (
  id: string, homeId: string, awayId: string,
  homeScore: number | null, awayScore: number | null,
  completed = true, round = 1,
): LeagueFixture => ({
  id, season_id: 's1', round_number: round,
  home_team_id: homeId, away_team_id: awayId,
  home_score: homeScore, away_score: awayScore,
  status: completed ? 'completed' : 'scheduled',
  scheduled_date: null, chief_judge_id: null, judge_ids: [], group_label: null,
})

/** Match-result z eno disciplinsko vrstico, ki nosi seštevek boule točk (za tiebreak testiranje). */
const makeResult = (fixtureId: string, homeBoules: number, awayBoules: number): LeagueMatchResult & { discipline_results: LeagueMatchDisciplineResult[] } => ({
  id: 'r_' + fixtureId, fixture_id: fixtureId,
  discipline_results: [{
    id: 'd_' + fixtureId, match_result_id: 'r_' + fixtureId, discipline_id: 'x',
    playground_number: null, home_score: homeBoules, away_score: awayBoules,
    home_match_points: 0, away_match_points: 0, home_players: [], away_players: [],
  }] as unknown as LeagueMatchDisciplineResult[],
} as unknown as LeagueMatchResult & { discipline_results: LeagueMatchDisciplineResult[] })

describe('calculateStandings — uvrstitev (točke po zmagah + tiebreaki)', () => {
  it('kriterij 1: točke po zmagah (zmaga 2 / remi 1 / poraz 0)', () => {
    const teams = [makeTeam('a', 'A'), makeTeam('b', 'B')]
    const s = calculateStandings(teams, [makeFixture('f1', 'a', 'b', 11, 7)], makeSeason())
    expect(s[0].team.id).toBe('a')
    expect(s[0].points).toBe(2)
    expect(s[1].points).toBe(0)
  })

  it('remi da obema 1 točko', () => {
    const teams = [makeTeam('a', 'A'), makeTeam('b', 'B')]
    const s = calculateStandings(teams, [makeFixture('f1', 'a', 'b', 10, 10)], makeSeason())
    expect(s[0].points).toBe(1); expect(s[1].points).toBe(1); expect(s[0].drawn).toBe(1)
  })

  it('kriterij 2: ob enakih točkah odločajo medsebojni dvoboji (match točke)', () => {
    const teams = [makeTeam('a', 'A'), makeTeam('b', 'B'), makeTeam('c', 'C')]
    const fixtures = [
      makeFixture('f1', 'a', 'b', 10, 14), // B zmaga
      makeFixture('f2', 'b', 'a', 11, 13), // A zmaga  => vsak 1Z/1P medsebojno; H2H match: A23 B25
      makeFixture('f3', 'a', 'c', 20, 4),  // A zmaga
      makeFixture('f4', 'b', 'c', 20, 4),  // B zmaga  => A in B: 2Z/1P => 4 točke (izenačeno)
    ]
    const s = calculateStandings(teams, fixtures, makeSeason())
    expect(s[0].points).toBe(4); expect(s[1].points).toBe(4)
    expect(s[0].team.id).toBe('b') // B višje po medsebojnih (25 > 23)
    expect(s[1].team.id).toBe('a')
  })

  it('kriterij 3: ob enakih točkah IN izenačenih medsebojnih odloča razlika boule točk', () => {
    // Pivka/Sivke primer: vsak zmaga doma 16:8 -> H2H match točke 24:24, točke 2:2
    const teams = [makeTeam('a', 'A'), makeTeam('b', 'B')]
    const fixtures = [
      makeFixture('f1', 'a', 'b', 16, 8), // A zmaga doma
      makeFixture('f2', 'b', 'a', 16, 8), // B zmaga doma
    ]
    // boule: f1 A169:B175 ; f2 B157:A146  => A=315, B=332 -> B višje (razlika +17)
    const results = [makeResult('f1', 169, 175), makeResult('f2', 157, 146)]
    const s = calculateStandings(teams, fixtures, makeSeason(), results)
    expect(s[0].points).toBe(2); expect(s[1].points).toBe(2)
    expect(s[0].team.id).toBe('b')
    expect(s[0].boulesFor).toBe(332); expect(s[1].boulesFor).toBe(315)
  })

  it('šteje odigrane, zmage, poraze; ignorira neodigrane', () => {
    const teams = [makeTeam('a', 'A'), makeTeam('b', 'B')]
    const fixtures = [makeFixture('f1', 'a', 'b', 11, 7), makeFixture('f2', 'a', 'b', null, null, false)]
    const s = calculateStandings(teams, fixtures, makeSeason())
    const a = s.find(x => x.team.id === 'a')!
    expect(a.played).toBe(1); expect(a.won).toBe(1)
    expect(a.pointsFor).toBe(11); expect(a.pointsAgainst).toBe(7)
  })

  it('izloči tekme končnice (round_number > rounds_count)', () => {
    const teams = [makeTeam('a', 'A'), makeTeam('b', 'B')]
    const fixtures = [
      makeFixture('f1', 'a', 'b', 10, 8, true, 1),   // redni del
      makeFixture('f2', 'a', 'b', 2, 20, true, 5),   // končnica — se NE šteje
    ]
    const s = calculateStandings(teams, fixtures, makeSeason({ rounds_count: 1 }))
    const a = s.find(x => x.team.id === 'a')!
    expect(a.played).toBe(1)
    expect(a.pointsFor).toBe(10)
  })
})

// ────────────────────────────────────────────────────────────────
// RAZDELITVENI SISTEM (OBZ Nova Gorica): 10 ekip, 9 kol + 5 kol v skupinah
// ────────────────────────────────────────────────────────────────
describe('calculateSplitStandings — prenos točk iz faze 1 v skupini', () => {
  const teams = Array.from({ length: 10 }, (_, i) => makeTeam(`t${i + 1}`, `Klub ${i + 1}`))
  const labeled = (f: LeagueFixture, label: string): LeagueFixture => ({ ...f, group_label: label })

  // Faza 1 (group_label prazen): t1 premaga t10 IN t2; t2 premaga t3.
  const p1 = [
    makeFixture('f1', 't1', 't10', 3, 1, true, 1),
    makeFixture('f2', 't1', 't2', 3, 2, true, 2),
    makeFixture('f3', 't2', 't3', 3, 0, true, 3),
  ]
  // Faza 2, skupina 1-5: t2 vrne poraz. Dve tekmi sta le razporejeni —
  // sta tu zato, da so v skupini vseh pet ekip.
  const p2 = [
    labeled(makeFixture('g1', 't2', 't1', 3, 1, true, 10), '1-5'),
    labeled(makeFixture('g2', 't3', 't4', null, null, false, 11), '1-5'),
    labeled(makeFixture('g3', 't5', 't1', null, null, false, 12), '1-5'),
  ]

  it('brez tekem faze 1 ni razdelitvenega sistema', () => {
    const r = calculateSplitStandings(teams, [], makeSeason())
    expect(r.hasSplit).toBe(false)
    expect(r.phase2).toBeNull()
  })

  it('dokler faze 2 ni, je lestvica ena sama (vseh 10 ekip)', () => {
    const r = calculateSplitStandings(teams, p1, makeSeason())
    expect(r.hasSplit).toBe(true)
    expect(r.phase2).toBeNull()
    expect(r.phase1).toHaveLength(10)
    expect(r.phase1[0].team.id).toBe('t1')      // dve zmagi
    expect(r.phase1[0].points).toBe(4)
  })

  it('ekipa v skupino prinese VSE točke iz 9 kol — tudi proti ekipam iz druge skupine', () => {
    const r = calculateSplitStandings(teams, [...p1, ...p2], makeSeason())
    const top = r.phase2!['1-5']
    const t1 = top.find(s => s.team.id === 't1')!

    // 2 (zmaga nad t10, ki je zdaj v spodnji skupini) + 2 (zmaga nad t2) + 0 (poraz v fazi 2)
    expect(t1.points).toBe(4)
    expect(t1.played).toBe(3)
  })

  it('tekme faze 2 se prištejejo prenesenim, ne nadomestijo', () => {
    const r = calculateSplitStandings(teams, [...p1, ...p2], makeSeason())
    const t2 = r.phase2!['1-5'].find(s => s.team.id === 't2')!
    // 0 (poraz s t1) + 2 (zmaga nad t3) + 2 (zmaga nad t1 v fazi 2)
    expect(t2.points).toBe(4)
    expect(t2.played).toBe(3)
  })

  it('ob izenačenju odloči medsebojni dvoboj — obe srečanji skupaj', () => {
    const r = calculateSplitStandings(teams, [...p1, ...p2], makeSeason())
    const top = r.phase2!['1-5']
    // t1 in t2 imata oba 4 točke; medsebojno t1 3:2 in 1:3 → t2 ima 5 match točk, t1 štiri
    expect(top[0].team.id).toBe('t2')
    expect(top[1].team.id).toBe('t1')
  })

  it('v skupini so vse ekipe, ki v njej nastopajo — tudi brez odigrane tekme', () => {
    const r = calculateSplitStandings(teams, [...p1, ...p2], makeSeason())
    expect(r.phase2!['1-5'].map(s => s.team.id).sort()).toEqual(['t1', 't2', 't3', 't4', 't5'])
    expect(r.phase2!['6-10']).toEqual([])
  })
})

describe('calculateSplitStandings — razdelitev je dokončna', () => {
  const teams = Array.from({ length: 10 }, (_, i) => makeTeam(`t${i + 1}`, `Klub ${i + 1}`))
  const labeled = (f: LeagueFixture, label: string): LeagueFixture => ({ ...f, group_label: label })

  // Faza 1: t6 (spodnja skupina) nabere veliko točk, t1 (zgornja) nobene.
  const p1 = [
    makeFixture('a1', 't6', 't7', 13, 0, true, 1),
    makeFixture('a2', 't6', 't8', 13, 0, true, 2),
    makeFixture('a3', 't6', 't9', 13, 0, true, 3),
    makeFixture('a4', 't2', 't1', 13, 0, true, 4),
  ]
  const p2 = [
    labeled(makeFixture('b1', 't1', 't2', null, null, false, 10), '1-5'),
    labeled(makeFixture('b2', 't3', 't4', null, null, false, 11), '1-5'),
    labeled(makeFixture('b3', 't5', 't1', null, null, false, 12), '1-5'),
    labeled(makeFixture('b4', 't6', 't7', null, null, false, 10), '6-10'),
    labeled(makeFixture('b5', 't8', 't9', null, null, false, 11), '6-10'),
    labeled(makeFixture('b6', 't10', 't6', null, null, false, 12), '6-10'),
  ]

  it('ekipa iz 6-10 z več točkami od ekipe iz 1-5 ostane v spodnji skupini', () => {
    const r = calculateSplitStandings(teams, [...p1, ...p2], makeSeason())
    const zgoraj = r.phase2!['1-5']
    const spodaj = r.phase2!['6-10']

    const t6 = spodaj.find(s => s.team.id === 't6')!
    const t1 = zgoraj.find(s => s.team.id === 't1')!
    expect(t6.points).toBeGreaterThan(t1.points)   // 6 točk proti 0 …

    // … pa vseeno ni v zgornji skupini: skupini se ne združita
    expect(zgoraj.map(s => s.team.id)).not.toContain('t6')
    const vObeh = zgoraj.map(s => s.team.id).filter(id => spodaj.some(s => s.team.id === id))
    expect(vObeh).toEqual([])
  })
})
