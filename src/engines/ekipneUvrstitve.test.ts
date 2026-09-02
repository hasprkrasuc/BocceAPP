import { describe, test, expect } from 'vitest'
import {
  tockeUvrstitveSuperLiga, tockeUvrstitvePokal, koncnaUvrstitevLige, tockeEkipeIgralcem,
  steUvrstitveEkip,
  type KoncnicaIzid,
} from './ekipneUvrstitve'

describe('uvrstitvene točke', () => {
  test('Super liga: zmagovalec 16, finalist 10, polfinalista po 7', () => {
    expect(tockeUvrstitveSuperLiga(1)).toBe(16)
    expect(tockeUvrstitveSuperLiga(2)).toBe(10)
    // Točke se delijo po končnici — 3. in 4. mesto (poraženca polfinalov)
    // dobita enako.
    expect(tockeUvrstitveSuperLiga(3)).toBe(7)
    expect(tockeUvrstitveSuperLiga(4)).toBe(7)
    expect(tockeUvrstitveSuperLiga(5)).toBe(0)
  })

  test('Pokal BZS: polovica superligaških', () => {
    expect(tockeUvrstitvePokal(1)).toBe(8)
    expect(tockeUvrstitvePokal(2)).toBe(5)
    expect(tockeUvrstitvePokal(3)).toBe(3.5)
    expect(tockeUvrstitvePokal(4)).toBe(3.5)
    expect(tockeUvrstitvePokal(5)).toBe(0)
  })
})

/** Odigrana tekma končnice z danim izidom. */
function tekma(label: string, home: string, away: string, hs: number, as_: number): KoncnicaIzid {
  return { group_label: label, home_team_id: home, away_team_id: away, home_score: hs, away_score: as_, status: 'completed' }
}

describe('končna uvrstitev lige', () => {
  const vrstniRed = ['A', 'B', 'C', 'D', 'E', 'F']

  test('brez končnice je uvrstitev kar lestvica rednega dela', () => {
    const mesta = koncnaUvrstitevLige(vrstniRed, [])
    expect(mesta.get('A')).toBe(1)
    expect(mesta.get('B')).toBe(2)
    expect(mesta.get('C')).toBe(3)
    expect(mesta.get('D')).toBe(4)
    expect(mesta.has('E')).toBe(false)
  })

  test('serija na dve dobljeni: finale da 1. in 2., poraženca polfinalov po lestvici', () => {
    // SF1: A premaga D 2:0, SF2: C premaga B 2:1, F: C premaga A 2:1.
    const mesta = koncnaUvrstitevLige(vrstniRed, [
      tekma('SF1', 'A', 'D', 12, 4), tekma('SF1', 'D', 'A', 4, 12),
      tekma('SF2', 'B', 'C', 12, 4), tekma('SF2', 'C', 'B', 12, 4), tekma('SF2', 'B', 'C', 4, 12),
      tekma('F', 'A', 'C', 12, 4), tekma('F', 'C', 'A', 12, 4), tekma('F', 'A', 'C', 4, 12),
    ])
    expect(mesta.get('C')).toBe(1)
    expect(mesta.get('A')).toBe(2)
    // B je bil v rednem delu 2., D 4. — B dobi 3. mesto.
    expect(mesta.get('B')).toBe(3)
    expect(mesta.get('D')).toBe(4)
  })

  test('final four s tekmo za 3. mesto: 3M določi 3. in 4.', () => {
    const mesta = koncnaUvrstitevLige(vrstniRed, [
      tekma('SF1', 'A', 'D', 12, 4),
      tekma('SF2', 'B', 'C', 4, 12),
      tekma('F', 'A', 'C', 12, 4),
      tekma('3M', 'B', 'D', 4, 12),
    ])
    expect(mesta.get('A')).toBe(1)
    expect(mesta.get('C')).toBe(2)
    expect(mesta.get('D')).toBe(3)
    expect(mesta.get('B')).toBe(4)
  })

  test('nedokončan finale ne podeli nobenega mesta', () => {
    const mesta = koncnaUvrstitevLige(vrstniRed, [
      tekma('SF1', 'A', 'D', 12, 4),
      tekma('SF2', 'B', 'C', 4, 12),
      // Serija F 1:1 — še ni odločena.
      tekma('F', 'A', 'C', 12, 4), tekma('F', 'C', 'A', 12, 4),
    ])
    expect(mesta.size).toBe(0)
  })

  test('neodigrane tekme končnice se ne štejejo', () => {
    const neodigrana: KoncnicaIzid = {
      group_label: 'F', home_team_id: 'A', away_team_id: 'C',
      home_score: null, away_score: null, status: 'pending',
    }
    const mesta = koncnaUvrstitevLige(vrstniRed, [
      tekma('SF1', 'A', 'D', 12, 4),
      tekma('SF2', 'B', 'C', 4, 12),
      tekma('F', 'A', 'C', 12, 4), neodigrana,
    ])
    // Ena zmaga A v finalu na eno tekmo? Ne — neodigrana tretja ne šteje,
    // A ima edino zmago in je zmagovalec finala.
    expect(mesta.get('A')).toBe(1)
    expect(mesta.get('C')).toBe(2)
  })
})

describe('tockeEkipeIgralcem', () => {
  const tocke = tockeUvrstitveSuperLiga
  const postave = new Map([
    ['prvak', ['a', 'b', 'brezNastopa']],
    ['finalist', ['c']],
  ])
  const mesta = new Map([['prvak', 1], ['finalist', 2]])
  const igral = (id: string) => id !== 'brezNastopa'

  test('igralec brez nastopa ne dobi točk za uvrstitev ekipe', () => {
    const izid = tockeEkipeIgralcem(mesta, postave, igral, tocke)
    expect(izid.map(u => u.playerId).sort()).toEqual(['a', 'b', 'c'])
    expect(izid.find(u => u.playerId === 'brezNastopa')).toBeUndefined()
  })

  test('kdor je igral, dobi točke svojega mesta', () => {
    const izid = tockeEkipeIgralcem(mesta, postave, igral, tocke)
    expect(izid.filter(u => u.playerId === 'a')[0]).toMatchObject({ pts: 16, placeLabel: '1. mesto' })
    expect(izid.filter(u => u.playerId === 'c')[0]).toMatchObject({ pts: 10, placeLabel: '2. mesto' })
  })

  test('brez nastopov ne dobi nihče nič', () => {
    expect(tockeEkipeIgralcem(mesta, postave, () => false, tocke)).toEqual([])
  })

  test('deljeno 3. mesto dobi oznako 3.–4. mesto, točke enake', () => {
    const m = new Map([['x', 3], ['y', 3]])
    const p = new Map([['x', ['i1']], ['y', ['i2']]])
    const izid = tockeEkipeIgralcem(m, p, () => true, tocke)
    expect(izid).toHaveLength(2)
    for (const u of izid) expect(u).toMatchObject({ pts: 7, placeLabel: '3.–4. mesto' })
  })

  test('samostojno 3. mesto obdrži svojo oznako', () => {
    const izid = tockeEkipeIgralcem(new Map([['x', 3]]), new Map([['x', ['i1']]]), () => true, tocke)
    expect(izid[0].placeLabel).toBe('3. mesto')
  })

  test('mesta zunaj točkovnika ne prinesejo ničesar', () => {
    const izid = tockeEkipeIgralcem(new Map([['x', 5]]), new Map([['x', ['i1']]]), () => true, tocke)
    expect(izid).toEqual([])
  })

  test('pokalne točke so polovične', () => {
    const izid = tockeEkipeIgralcem(new Map([['x', 1]]), new Map([['x', ['i1']]]), () => true, tockeUvrstitvePokal)
    expect(izid[0].pts).toBe(8)
  })
})

describe('steUvrstitveEkip', () => {
  test('moška Super liga prinaša točke', () => {
    expect(steUvrstitveEkip({ tier: 'super_liga', category: 'men', format: 'flat' })).toBe(true)
  })

  test('ženska 1. liga prinaša točke — pri ženskah višje ni', () => {
    expect(steUvrstitveEkip({ tier: '1_liga', category: 'women', format: 'flat' })).toBe(true)
  })

  test('moška 1. liga NE prinaša — je druga raven', () => {
    expect(steUvrstitveEkip({ tier: '1_liga', category: 'men', format: 'groups' })).toBe(false)
  })

  test('pokal prinaša v obeh kategorijah', () => {
    expect(steUvrstitveEkip({ tier: null, category: 'men', format: 'pokal' })).toBe(true)
    expect(steUvrstitveEkip({ tier: null, category: 'women', format: 'pokal' })).toBe(true)
  })

  test('nižje lige in območne ne prinašajo', () => {
    for (const tier of ['2_liga_zahod', '2_liga_vzhod', 'obz']) {
      expect(steUvrstitveEkip({ tier, category: 'men', format: 'flat' }), tier).toBe(false)
      expect(steUvrstitveEkip({ tier, category: 'women', format: 'flat' }), tier).toBe(false)
    }
  })

  test('mladinske lige ne prinašajo', () => {
    expect(steUvrstitveEkip({ tier: '1_liga', category: 'u18', format: 'flat' })).toBe(false)
    expect(steUvrstitveEkip({ tier: '1_liga', category: 'u14', format: 'flat' })).toBe(false)
  })
})
