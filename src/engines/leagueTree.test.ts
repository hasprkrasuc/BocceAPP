import { describe, test, expect } from 'vitest'
import { pickLeagueTreeSeasons, LEAGUE_TREE_SLOTS } from './leagueTree'

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
