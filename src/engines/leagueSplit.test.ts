import { describe, it, expect } from 'vitest'
import {
  splitGroups, splitPhase2Fixtures, validateSplitPhase1,
  SPLIT_PHASE1_ROUNDS, SPLIT_PHASE2_ROUNDS, SPLIT_TOP, SPLIT_BOTTOM,
  type Phase1Meeting,
} from './leagueSplit'
import { bergerFixtures } from './berger'

/** Deset ekip z žrebanimi številkami 1..10. */
const TEAMS = Array.from({ length: 10 }, (_, i) => ({ id: `t${i + 1}`, draw_number: i + 1 }))

/** Faza 1: enokrožni Bergerjev razpored za 10 ekip = 9 kol, 45 tekem. */
const phase1: Phase1Meeting[] = bergerFixtures(TEAMS, false)

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

const group = (ids: string[]) => ids.map((id, i) => ({ id, position: i + 1 }))

describe('faza 1 — izhodišče razdelitvenega sistema', () => {
  it('deset ekip enokrožno da 9 kol in 45 tekem, vsak par natanko enkrat', () => {
    expect(phase1.length).toBe(45)
    const rounds = new Set(bergerFixtures(TEAMS, false).map(f => f.round_number))
    expect(rounds.size).toBe(SPLIT_PHASE1_ROUNDS)

    const pairs = new Set(phase1.map(f => pairKey(f.home_team_id, f.away_team_id)))
    expect(pairs.size).toBe(45)
  })
})

describe('splitGroups — razdelitev po lestvici', () => {
  it('prvih pet gre v 1-5, zadnjih pet v 6-10', () => {
    const lestvica = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
    const { top, bottom } = splitGroups(lestvica)
    expect(top).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(bottom).toEqual(['f', 'g', 'h', 'i', 'j'])
  })

  it('zavrne ligo, ki nima natanko deset ekip', () => {
    expect(() => splitGroups(['a', 'b', 'c'])).toThrow(/natanko 10 ekip/)
  })
})

describe('splitPhase2Fixtures — razpored skupine petih', () => {
  const top = group(['t1', 't2', 't3', 't4', 't5'])
  const fixtures = splitPhase2Fixtures(top, SPLIT_TOP, SPLIT_PHASE1_ROUNDS + 1, phase1)

  it('pet kol, dve tekmi na kolo, deset tekem skupaj', () => {
    expect(fixtures.length).toBe(10)
    const byRound = new Map<number, number>()
    for (const f of fixtures) byRound.set(f.round_number, (byRound.get(f.round_number) ?? 0) + 1)
    expect(byRound.size).toBe(SPLIT_PHASE2_ROUNDS)
    for (const [, count] of byRound) expect(count).toBe(2)
  })

  it('kola se nadaljujejo za fazo 1 (10..14)', () => {
    const rounds = [...new Set(fixtures.map(f => f.round_number))].sort((a, b) => a - b)
    expect(rounds).toEqual([10, 11, 12, 13, 14])
  })

  it('vsako kolo ena ekipa počiva', () => {
    for (let r = 10; r <= 14; r++) {
      const igra = new Set<string>()
      for (const f of fixtures.filter(x => x.round_number === r)) {
        igra.add(f.home_team_id); igra.add(f.away_team_id)
      }
      expect(igra.size).toBe(4)   // pet ekip, štiri igrajo
    }
  })

  it('vsak par se sreča natanko enkrat, vsaka ekipa odigra štiri tekme', () => {
    const pairs = fixtures.map(f => pairKey(f.home_team_id, f.away_team_id))
    expect(new Set(pairs).size).toBe(10)

    const played = new Map<string, number>()
    for (const f of fixtures) {
      played.set(f.home_team_id, (played.get(f.home_team_id) ?? 0) + 1)
      played.set(f.away_team_id, (played.get(f.away_team_id) ?? 0) + 1)
    }
    for (const id of ['t1', 't2', 't3', 't4', 't5']) expect(played.get(id)).toBe(4)
  })

  // ⇩ jedro pravila
  it('dom/gost je OBRNJEN glede na fazo 1 — pri vseh desetih parih', () => {
    const home1 = new Map(phase1.map(f => [pairKey(f.home_team_id, f.away_team_id), f.home_team_id]))
    for (const f of fixtures) {
      const prej = home1.get(pairKey(f.home_team_id, f.away_team_id))
      expect(prej).toBe(f.away_team_id)          // kdor je bil doma, je zdaj v gosteh
      expect(prej).not.toBe(f.home_team_id)
    }
  })

  it('obrat velja tudi za spodnjo skupino', () => {
    const bottom = group(['t6', 't7', 't8', 't9', 't10'])
    const spodaj = splitPhase2Fixtures(bottom, SPLIT_BOTTOM, 10, phase1)
    const home1 = new Map(phase1.map(f => [pairKey(f.home_team_id, f.away_team_id), f.home_team_id]))
    expect(spodaj.length).toBe(10)
    for (const f of spodaj) {
      expect(home1.get(pairKey(f.home_team_id, f.away_team_id))).toBe(f.away_team_id)
      expect(f.group_label).toBe('6-10')
    }
  })

  it('vsaka ekipa je v fazi 2 doma natankokrat tolikokrat, kolikorkrat je bila v fazi 1 v gosteh (znotraj skupine)', () => {
    const ids = new Set(['t1', 't2', 't3', 't4', 't5'])
    const gostVFazi1 = new Map<string, number>()
    for (const f of phase1) {
      if (!ids.has(f.home_team_id) || !ids.has(f.away_team_id)) continue
      gostVFazi1.set(f.away_team_id, (gostVFazi1.get(f.away_team_id) ?? 0) + 1)
    }
    const domaVFazi2 = new Map<string, number>()
    for (const f of fixtures) domaVFazi2.set(f.home_team_id, (domaVFazi2.get(f.home_team_id) ?? 0) + 1)
    for (const id of ids) expect(domaVFazi2.get(id) ?? 0).toBe(gostVFazi1.get(id) ?? 0)
  })

  it('zavrne skupino, ki nima petih ekip', () => {
    expect(() => splitPhase2Fixtures(group(['t1', 't2']), SPLIT_TOP, 10, phase1))
      .toThrow(/natanko 5 ekip/)
  })

  it('zavrne podvojeno uvrstitev', () => {
    const slabo = [
      { id: 't1', position: 1 }, { id: 't2', position: 1 }, { id: 't3', position: 3 },
      { id: 't4', position: 4 }, { id: 't5', position: 5 },
    ]
    expect(() => splitPhase2Fixtures(slabo, SPLIT_TOP, 10, phase1)).toThrow(/podvojena uvrstitev/)
  })

  it('pade, če para v fazi 1 ni bilo — obrata ni na čem graditi', () => {
    const brezPara = phase1.filter(f =>
      !(pairKey(f.home_team_id, f.away_team_id) === pairKey('t1', 't2')))
    expect(() => splitPhase2Fixtures(group(['t1', 't2', 't3', 't4', 't5']), SPLIT_TOP, 10, brezPara))
      .toThrow(/dom\/gost ni mogoče obrniti/)
  })

  it('pade, če je bila faza 1 dvokrožna — obrat ne bi bil enoličen', () => {
    const dvokrozno = bergerFixtures(TEAMS, true)
    expect(() => splitPhase2Fixtures(group(['t1', 't2', 't3', 't4', 't5']), SPLIT_TOP, 10, dvokrozno))
      .toThrow(/enokrožna/)
  })
})

describe('validateSplitPhase1 — ali je liga pripravljena na razdelitev', () => {
  const odigrane = phase1.map(f => ({ ...f, status: 'completed' }))
  const teams = TEAMS.map(t => ({ id: t.id }))

  it('polna odigrana faza 1 nima napak', () => {
    expect(validateSplitPhase1(teams, odigrane)).toEqual([])
  })

  it('javi premalo ekip', () => {
    const napake = validateSplitPhase1(teams.slice(0, 8), odigrane)
    expect(napake.some(n => n.includes('natanko 10 ekip'))).toBe(true)
  })

  it('javi neodigrane tekme', () => {
    const delno = odigrane.map((f, i) => i < 3 ? { ...f, status: 'scheduled' } : f)
    const napake = validateSplitPhase1(teams, delno)
    expect(napake.some(n => n.includes('3 tekem brez rezultata'))).toBe(true)
  })
})
