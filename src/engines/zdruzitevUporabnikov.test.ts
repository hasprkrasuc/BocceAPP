import { describe, test, expect } from 'vitest'
import {
  SKLICI, kljucSklica, skupajSklicev, tihaIzguba,
  izberiObdrzanega, zdruzenaPolja, preveriZdruzitev,
  type ZapisZaZdruzitev,
} from './zdruzitevUporabnikov'

/** Sintetični zapis; polja, ki v testu niso pomembna, so prazna. */
function z(over: Partial<ZapisZaZdruzitev> & { id: string }): ZapisZaZdruzitev {
  return {
    full_name: 'ZZ Test Oseba',
    email: 'zztest@balinar.app',
    emso: null,
    date_of_birth: null,
    license_number: null,
    gender: null,
    club_id: null,
    photo_url: null,
    role: 'player',
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('seznam sklicev', () => {
  test('vsak sklic ima tabelo, stolpec in opis', () => {
    for (const s of SKLICI) {
      expect(s.tabela, `tabela pri ${JSON.stringify(s)}`).toBeTruthy()
      expect(s.stolpec, `stolpec pri ${s.tabela}`).toBeTruthy()
      expect(s.opis, `opis pri ${kljucSklica(s)}`).toBeTruthy()
    }
  })

  test('ključi so enolični — podvojen sklic bi se prestavil dvakrat', () => {
    const kljuci = SKLICI.map(kljucSklica)
    expect(new Set(kljuci).size).toBe(kljuci.length)
  })

  test('stolpci brez tujega ključa so označeni z obBrisu null', () => {
    const brezKljuca = SKLICI.filter(s => s.obBrisu === null).map(kljucSklica)
    expect(brezKljuca).toEqual([
      'league_fixtures.judge_ids',
      'league_match_discipline_results.home_players',
      'league_match_discipline_results.away_players',
    ])
  })

  test('vsak jsonb in polje je brez tujega ključa in obratno', () => {
    for (const s of SKLICI) {
      if (s.vrsta === 'fk') expect(s.obBrisu, kljucSklica(s)).not.toBeNull()
      else expect(s.obBrisu, kljucSklica(s)).toBeNull()
    }
  })
})

describe('štetje sklicev', () => {
  test('sešteje vse vrednosti', () => {
    expect(skupajSklicev({ 'a.b': 2, 'c.d': 3 })).toBe(5)
  })

  test('prazno štetje je nič', () => {
    expect(skupajSklicev(undefined)).toBe(0)
    expect(skupajSklicev(null)).toBe(0)
    expect(skupajSklicev({})).toBe(0)
  })

  test('tihaIzguba našteje sklice, ki bi ob brisu izginili brez opozorila', () => {
    const izguba = tihaIzguba({
      'player_statistics.player_id': 3,          // CASCADE — tiho izgine
      'league_fixtures.judge_ids': 1,            // brez ključa — ostane visel
      'league_team_players.player_id': 2,        // NO ACTION — baza ustavi bris
    }).map(kljucSklica)
    expect(izguba).toContain('player_statistics.player_id')
    expect(izguba).toContain('league_fixtures.judge_ids')
    expect(izguba).not.toContain('league_team_players.player_id')
  })
})

describe('izbira obdržanega zapisa', () => {
  const star = z({ id: 'star', created_at: '2026-07-05T00:00:00Z' })
  const nov = z({ id: 'nov', created_at: '2026-08-23T00:00:00Z' })

  test('obdrži tistega z več sklici, tudi če je novejši', () => {
    const r = izberiObdrzanega(star, { 'a.b': 1 }, nov, { 'a.b': 5 })
    expect(r.obdrzan.id).toBe('nov')
    expect(r.opusceni.id).toBe('star')
    expect(r.razlog).toContain('5')
  })

  test('ob izenačenju obdrži starejšega', () => {
    const r = izberiObdrzanega(nov, { 'a.b': 2 }, star, { 'a.b': 2 })
    expect(r.obdrzan.id).toBe('star')
    expect(r.razlog).toContain('starejši')
  })

  test('brez sklicev na obeh straneh odloči starost', () => {
    const r = izberiObdrzanega(nov, undefined, star, undefined)
    expect(r.obdrzan.id).toBe('star')
  })

  test('brez datuma nastanka ne pade in obdrži prvega', () => {
    const x = z({ id: 'x', created_at: undefined })
    const y = z({ id: 'y', created_at: undefined })
    expect(izberiObdrzanega(x, undefined, y, undefined).obdrzan.id).toBe('x')
  })

  test('zapis brez datuma velja za starejšega od tistega z datumom', () => {
    const brez = z({ id: 'brez', created_at: undefined })
    expect(izberiObdrzanega(brez, undefined, star, undefined).obdrzan.id).toBe('brez')
  })

  test('primer Brus: stari nosi 2 prijavi, novi 1 članstvo — obdrži starega', () => {
    const r = izberiObdrzanega(
      star, { 'tournament_registrations.player1_id': 2 },
      nov, { 'league_team_players.player_id': 1 },
    )
    expect(r.obdrzan.id).toBe('star')
  })
})

describe('zlivanje podatkov', () => {
  test('prazna polja obdržanega se napolnijo z opuščenega', () => {
    const obdrzan = z({ id: 'a' })
    const opusceni = z({ id: 'b', emso: '1912969500518', date_of_birth: '1969-12-19', license_number: '3356' })
    const { patch, prevzeto } = zdruzenaPolja(obdrzan, opusceni)
    expect(patch.emso).toBe('1912969500518')
    expect(patch.date_of_birth).toBe('1969-12-19')
    expect(patch.license_number).toBe('3356')
    expect(prevzeto).toEqual(['EMŠO', 'datum rojstva', 'številka licence'])
  })

  test('zasedenih polj ne povozi', () => {
    const obdrzan = z({ id: 'a', emso: '0101970500001' })
    const opusceni = z({ id: 'b', emso: '1912969500518' })
    expect(zdruzenaPolja(obdrzan, opusceni).patch.emso).toBeUndefined()
  })

  test('prazen niz šteje za prazno polje', () => {
    const obdrzan = z({ id: 'a', license_number: '' })
    const opusceni = z({ id: 'b', license_number: '3356' })
    expect(zdruzenaPolja(obdrzan, opusceni).patch.license_number).toBe('3356')
  })

  test('višja vloga preživi združitev', () => {
    const obdrzan = z({ id: 'a', role: 'player' })
    const opusceni = z({ id: 'b', role: 'judge' })
    expect(zdruzenaPolja(obdrzan, opusceni).vloga).toBe('judge')
    expect(zdruzenaPolja(opusceni, obdrzan).vloga).toBe('judge')
  })

  test('pravi naslov premaga tistega, ki ga je dodelila aplikacija', () => {
    const obdrzan = z({ id: 'a', email: 'janez.brus@bocceapp.si' })
    const opusceni = z({ id: 'b', email: 'janez@gmail.com' })
    expect(zdruzenaPolja(obdrzan, opusceni).naslov).toBe('janez@gmail.com')
  })

  test('pravega naslova obdržanega ne zamenja z generičnim', () => {
    const obdrzan = z({ id: 'a', email: 'janez@gmail.com' })
    const opusceni = z({ id: 'b', email: 'janez.brus@balinar.app' })
    expect(zdruzenaPolja(obdrzan, opusceni).naslov).toBeNull()
  })

  test('kadar sta oba naslova generična, naslov ostane nespremenjen', () => {
    const obdrzan = z({ id: 'a', email: 'a@balinar.app' })
    const opusceni = z({ id: 'b', email: 'b@bocceapp.si' })
    expect(zdruzenaPolja(obdrzan, opusceni).naslov).toBeNull()
  })

  test('brez česa za prenesti je patch prazen', () => {
    const { patch, prevzeto } = zdruzenaPolja(z({ id: 'a' }), z({ id: 'b' }))
    expect(Object.keys(patch)).toHaveLength(0)
    expect(prevzeto).toHaveLength(0)
  })
})

describe('presoja pred združitvijo', () => {
  test('isti zapis dvakrat je napaka', () => {
    const a = z({ id: 'isti' })
    expect(preveriZdruzitev(a, a).napake).toHaveLength(1)
  })

  test('različen EMŠO je opozorilo, ne napaka — vrednost je lahko pokvarjena', () => {
    const r = preveriZdruzitev(
      z({ id: 'a', emso: '1912969500518' }),
      z({ id: 'b', emso: '0101970500001' }),
    )
    expect(r.napake).toHaveLength(0)
    expect(r.opozorila.join(' ')).toContain('EMŠO')
  })

  test('enak EMŠO ne sproži opozorila', () => {
    const r = preveriZdruzitev(
      z({ id: 'a', emso: '1912969500518' }),
      z({ id: 'b', emso: '1912969500518' }),
    )
    expect(r.opozorila).toHaveLength(0)
  })

  test('EMŠO samo na eni strani ni nasprotje', () => {
    const r = preveriZdruzitev(z({ id: 'a', emso: '1912969500518' }), z({ id: 'b' }))
    expect(r.opozorila).toHaveLength(0)
  })

  test('dva skrbnika sprožita opozorilo', () => {
    const r = preveriZdruzitev(z({ id: 'a', role: 'admin' }), z({ id: 'b', role: 'super_admin' }))
    expect(r.opozorila.join(' ')).toContain('skrbniške')
  })

  test('različna kluba opozorita, da obvelja klub obdržanega', () => {
    const r = preveriZdruzitev(z({ id: 'a', club_id: 'k1' }), z({ id: 'b', club_id: 'k2' }))
    expect(r.opozorila.join(' ')).toContain('klub')
  })

  test('primer Brus: prazen zapis proti polnemu gre brez opozoril', () => {
    const r = preveriZdruzitev(
      z({ id: 'star', created_at: '2026-07-05T00:00:00Z' }),
      z({ id: 'nov', emso: '1912969500518', date_of_birth: '1969-12-19', license_number: '3356' }),
    )
    expect(r.napake).toHaveLength(0)
    expect(r.opozorila).toHaveLength(0)
  })
})
