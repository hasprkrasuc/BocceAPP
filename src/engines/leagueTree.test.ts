import { describe, test, expect } from 'vitest'
import { pickLeagueTreeSeasons, pickObzSeasons, LEAGUE_TREE_SLOTS } from './leagueTree'

type S = { id: string; tier: string | null; category: string; year: number; status: string }

const mk = (p: Partial<S> & { id: string }): S => ({
  tier: 'super_liga', category: 'men', year: 2025, status: 'active', ...p,
})

describe('pickLeagueTreeSeasons', () => {
  test('preslika vsako raven na pravo sezono', () => {
    const seasons: S[] = [
      mk({ id: 'sl', tier: 'super_liga', category: 'men' }),
      mk({ id: '1m', tier: '1_liga', category: 'men' }),
      mk({ id: '2v', tier: '2_liga_vzhod', category: 'men' }),
      mk({ id: '2z', tier: '2_liga_zahod', category: 'men' }),
      mk({ id: '1z', tier: '1_liga', category: 'women' }),
      mk({ id: 'u14', tier: null, category: 'u14' }),
      mk({ id: 'u18', tier: null, category: 'u18' }),
    ]
    const r = pickLeagueTreeSeasons(seasons)
    expect(r.super_liga?.id).toBe('sl')
    expect(r['1_liga']?.id).toBe('1m')
    expect(r['2_liga_vzhod']?.id).toBe('2v')
    expect(r['2_liga_zahod']?.id).toBe('2z')
    expect(r['1_liga_zenske']?.id).toBe('1z')
    expect(r.u14?.id).toBe('u14')
    expect(r.u18?.id).toBe('u18')
  })

  test('1. liga moški in 1. liga članice se NE mešata (po kategoriji)', () => {
    const seasons: S[] = [
      mk({ id: 'men', tier: '1_liga', category: 'men' }),
      mk({ id: 'women', tier: '1_liga', category: 'women' }),
    ]
    const r = pickLeagueTreeSeasons(seasons)
    expect(r['1_liga']?.id).toBe('men')
    expect(r['1_liga_zenske']?.id).toBe('women')
  })

  test('izbere najnovejšo sezono (najvišje leto)', () => {
    const seasons: S[] = [
      mk({ id: 'old', tier: 'super_liga', year: 2024 }),
      mk({ id: 'new', tier: 'super_liga', year: 2025 }),
    ]
    expect(pickLeagueTreeSeasons(seasons).super_liga?.id).toBe('new')
  })

  test('pri istem letu ima prednost aktivna sezona', () => {
    const seasons: S[] = [
      mk({ id: 'draft', tier: 'super_liga', year: 2025, status: 'draft' }),
      mk({ id: 'active', tier: 'super_liga', year: 2025, status: 'active' }),
    ]
    expect(pickLeagueTreeSeasons(seasons).super_liga?.id).toBe('active')
  })

  test('manjkajoča raven vrne null', () => {
    const r = pickLeagueTreeSeasons([mk({ id: 'sl', tier: 'super_liga' })])
    expect(r['2_liga_vzhod']).toBeNull()
    expect(r.u14).toBeNull()
  })

  test('LEAGUE_TREE_SLOTS vsebuje vseh 7 ravni', () => {
    expect(LEAGUE_TREE_SLOTS).toEqual([
      'super_liga', '1_liga', '2_liga_vzhod', '2_liga_zahod', '1_liga_zenske', 'u14', 'u18',
    ])
  })
})

describe('pickObzSeasons (območne lige)', () => {
  type O = S & { obz_name?: string | null; name?: string }
  const mkObz = (o: Partial<O> & { id: string }): O => ({
    tier: 'obz', category: 'men', year: 2026, status: 'draft', ...o,
  })

  test('vrne VSE območne lige, ne le ene — teh je lahko 10 hkrati', () => {
    const seasons: O[] = [
      mkObz({ id: 'a', obz_name: 'OBZ Postojna' }),
      mkObz({ id: 'b', obz_name: 'OBZ Ljubljana' }),
      mkObz({ id: 'c', obz_name: 'OBZ Sežana' }),
    ]
    expect(pickObzSeasons(seasons).map(s => s.id).sort()).toEqual(['a', 'b', 'c'])
  })

  test('uredi po imenu OBZ (slovensko)', () => {
    const seasons: O[] = [
      mkObz({ id: 'p', obz_name: 'OBZ Postojna' }),
      mkObz({ id: 'l', obz_name: 'OBZ Ljubljana' }),
    ]
    expect(pickObzSeasons(seasons).map(s => s.obz_name)).toEqual(['OBZ Ljubljana', 'OBZ Postojna'])
  })

  test('ne pobere sezon drugih ravni', () => {
    const seasons: O[] = [
      mkObz({ id: 'obz1', obz_name: 'OBZ Maribor' }),
      { id: 'sl', tier: 'super_liga', category: 'men', year: 2026, status: 'active' },
      { id: 'u14', tier: null, category: 'u14', year: 2026, status: 'active' },
    ]
    expect(pickObzSeasons(seasons).map(s => s.id)).toEqual(['obz1'])
  })

  test('REGRESIJA: območne lige niso v drevesu, zato bi brez pickObzSeasons izginile', () => {
    const seasons: O[] = [mkObz({ id: 'obz1', obz_name: 'OBZ Nova Gorica' })]
    // Drevo je ne izbere na nobeni ravni ...
    const tree = pickLeagueTreeSeasons(seasons)
    expect(Object.values(tree).every(v => v === null)).toBe(true)
    // ... zato jo mora postreči pickObzSeasons.
    expect(pickObzSeasons(seasons)).toHaveLength(1)
  })
})
