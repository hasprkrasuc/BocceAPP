import { describe, test, expect } from 'vitest'
import { zapisnikJePrazen, type Zapisnik } from './zapisnikPrazen'

/** Zapisnik, kakršen nastane ob odprtju »Uredi zapisnik«: glava prazna, pet praznih disciplin. */
const svezZapisnik = (): Zapisnik => ({
  judges: null, chief_judge: null, viewers: null, time_end: null,
  draw_natancno_field: null, draw_blok4: null,
  discipline_results: Array.from({ length: 5 }, () => ({
    playground_number: null,
    home_score: null, away_score: null,
    home_match_points: null, away_match_points: null,
    home_players: [], away_players: [],
  })),
})

describe('zapisnikJePrazen', () => {
  test('tekma brez zapisnika je prazna', () => {
    expect(zapisnikJePrazen([])).toBe(true)
    expect(zapisnikJePrazen(null)).toBe(true)
    expect(zapisnikJePrazen(undefined)).toBe(true)
  })

  test('zapisnik, ki je nastal ob odprtju, je prazen', () => {
    // Prav ta primer je zaklenil menjavo domačina pri Šiška–Sivke: vrstica je
    // obstajala, v njej pa ni bilo ničesar.
    expect(zapisnikJePrazen([svezZapisnik()])).toBe(true)
  })

  test('vpisan izid ene discipline ni več prazen', () => {
    const z = svezZapisnik()
    z.discipline_results![2].home_score = 13
    expect(zapisnikJePrazen([z])).toBe(false)
  })

  test('izid 0 šteje kot vpisan', () => {
    // Ničla je veljaven izid; če bi jo brali kot »prazno«, bi obrnili zapisnik
    // z vpisanim rezultatom.
    const z = svezZapisnik()
    z.discipline_results![0].away_score = 0
    expect(zapisnikJePrazen([z])).toBe(false)
  })

  test('match točke 0 štejejo kot vpisane', () => {
    const z = svezZapisnik()
    z.discipline_results![1].home_match_points = 0
    expect(zapisnikJePrazen([z])).toBe(false)
  })

  test('vpisana postava ni več prazna', () => {
    const z = svezZapisnik()
    z.discipline_results![3].home_players = ['igralec-1']
    expect(zapisnikJePrazen([z])).toBe(false)
  })

  test('prazni nizi in null v postavi ne štejejo', () => {
    const z = svezZapisnik()
    z.discipline_results![3].home_players = ['', null, '  ']
    expect(zapisnikJePrazen([z])).toBe(true)
  })

  test('izbrano igrišče ni več prazno', () => {
    const z = svezZapisnik()
    z.discipline_results![4].playground_number = 2
    expect(zapisnikJePrazen([z])).toBe(false)
  })

  test('karkoli v glavi pomeni, da ni prazen', () => {
    for (const glava of [
      { judges: 'Novak' },
      { chief_judge: 'Kosar' },
      { viewers: 0 },
      { time_end: '19:30' },
      { draw_natancno_field: 1 },
      { draw_blok4: { a: 1 } },
    ]) {
      const z = { ...svezZapisnik(), ...glava }
      expect(zapisnikJePrazen([z]), `glava ${JSON.stringify(glava)}`).toBe(false)
    }
  })

  test('prazni nizi v glavi ne štejejo', () => {
    const z = { ...svezZapisnik(), judges: '   ', chief_judge: '' }
    expect(zapisnikJePrazen([z])).toBe(true)
  })

  test('dovolj je, da ima vsebino en zapisnik od več', () => {
    const poln = svezZapisnik()
    poln.discipline_results![0].home_score = 9
    expect(zapisnikJePrazen([svezZapisnik(), poln])).toBe(false)
  })

  test('zapisnik brez seznama disciplin je prazen', () => {
    expect(zapisnikJePrazen([{ discipline_results: null }])).toBe(true)
    expect(zapisnikJePrazen([{}])).toBe(true)
  })
})
