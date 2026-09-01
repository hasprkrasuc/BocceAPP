import { describe, test, expect } from 'vitest'
import {
  tockeUvrstitveSuperLiga, tockeUvrstitvePokal, koncnaUvrstitevLige,
  type KoncnicaIzid,
} from './ekipneUvrstitve'

describe('uvrstitvene točke', () => {
  test('Super liga: 16 / 10 / 8 / 7, od 5. mesta naprej nič', () => {
    expect(tockeUvrstitveSuperLiga(1)).toBe(16)
    expect(tockeUvrstitveSuperLiga(2)).toBe(10)
    expect(tockeUvrstitveSuperLiga(3)).toBe(8)
    expect(tockeUvrstitveSuperLiga(4)).toBe(7)
    expect(tockeUvrstitveSuperLiga(5)).toBe(0)
  })

  test('Pokal BZS: polovica superligaških', () => {
    expect(tockeUvrstitvePokal(1)).toBe(8)
    expect(tockeUvrstitvePokal(2)).toBe(5)
    expect(tockeUvrstitvePokal(3)).toBe(4)
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
