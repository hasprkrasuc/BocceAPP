import { describe, test, expect } from 'vitest'
import { aktualnoKolo, danesLokalno, oznakaStanjaKola, type TerminKola } from './aktualnoKolo'

/** Kolo z enim samim terminom za vse tekme. */
const kolo = (round_number: number, datum: string | null, koliko = 2): TerminKola[] =>
  Array.from({ length: koliko }, () => ({ round_number, scheduled_date: datum }))

/** Tekme kola po naštetih datumih (po ena na datum). */
const koloPoDatumih = (round_number: number, ...datumi: string[]): TerminKola[] =>
  datumi.map(d => ({ round_number, scheduled_date: d }))

describe('aktualnoKolo', () => {
  test('kolo, ki se igra danes, je v teku', () => {
    const tekme = [...kolo(1, '2026-09-05'), ...kolo(2, '2026-09-19'), ...kolo(3, '2026-10-03')]
    expect(aktualnoKolo(tekme, '2026-09-19')).toEqual({ kolo: 2, stanje: 'v_teku' })
  })

  test('dan po odigranem kolu je aktualno naslednje', () => {
    const tekme = [...kolo(1, '2026-09-05'), ...kolo(2, '2026-09-19'), ...kolo(3, '2026-10-03')]
    expect(aktualnoKolo(tekme, '2026-09-20')).toEqual({ kolo: 3, stanje: 'naslednje' })
  })

  test('pred začetkom sezone je aktualno prvo kolo', () => {
    const tekme = [...kolo(1, '2026-09-05'), ...kolo(2, '2026-09-19')]
    expect(aktualnoKolo(tekme, '2026-08-01')).toEqual({ kolo: 1, stanje: 'naslednje' })
  })

  test('po koncu sezone obstanemo pri zadnjem odigranem kolu', () => {
    const tekme = [...kolo(1, '2026-09-05'), ...kolo(2, '2026-09-19')]
    expect(aktualnoKolo(tekme, '2026-12-24')).toEqual({ kolo: 2, stanje: 'zadnje_odigrano' })
  })

  test('kolo v dveh dneh je v teku oba dneva in vmesni dan', () => {
    // Kolo se pogosto igra v soboto in ponedeljek; v nedeljo še ni mimo.
    const tekme = [
      ...koloPoDatumih(4, '2026-09-19T17:00:00+00', '2026-09-21T10:00:00+00'),
      ...kolo(5, '2026-10-03'),
    ]
    expect(aktualnoKolo(tekme, '2026-09-19')).toEqual({ kolo: 4, stanje: 'v_teku' })
    expect(aktualnoKolo(tekme, '2026-09-20')).toEqual({ kolo: 4, stanje: 'v_teku' })
    expect(aktualnoKolo(tekme, '2026-09-21')).toEqual({ kolo: 4, stanje: 'v_teku' })
    expect(aktualnoKolo(tekme, '2026-09-22')).toEqual({ kolo: 5, stanje: 'naslednje' })
  })

  /**
   * PRAVI PRIMER, ki je podrl prvo izvedbo.
   *
   * 1. liga 2026/27: 1. kolo ima pet tekem 5. 9. in eno prestavljeno na 27. 9.
   * 2. kolo je 12. 9. odigrano v celoti, 3. kolo je 26. 9. Razpon 1. kola je
   * tako 5.–27. september. Če bi se odločali po razponu, bi 25. septembra
   * razpored odprli pri 1. kolu — čeprav je naslednja tekma 3. kolo jutri.
   */
  test('prestavljena tekma ne zadrži razporeda pri starem kolu', () => {
    const tekme = [
      ...koloPoDatumih(1, '2026-09-05', '2026-09-05', '2026-09-05', '2026-09-05', '2026-09-05', '2026-09-27'),
      ...kolo(2, '2026-09-12', 6),
      ...kolo(3, '2026-09-26', 6),
    ]
    expect(aktualnoKolo(tekme, '2026-09-25')).toEqual({ kolo: 3, stanje: 'naslednje' })
    // Naslednji dan se 3. kolo igra …
    expect(aktualnoKolo(tekme, '2026-09-26')).toEqual({ kolo: 3, stanje: 'v_teku' })
    // … dan zatem pa je na vrsti prav prestavljena tekma 1. kola.
    expect(aktualnoKolo(tekme, '2026-09-27')).toEqual({ kolo: 1, stanje: 'v_teku' })
  })

  test('kolo, raztegnjeno prek več datumov, ostane aktualno do zadnje tekme', () => {
    // Pokal BZS ima kolo razpotegnjeno prek osmih datumov.
    const tekme = koloPoDatumih(1,
      '2026-09-08', '2026-09-09', '2026-09-14', '2026-09-16', '2026-09-20')
    expect(aktualnoKolo(tekme, '2026-09-10')).toEqual({ kolo: 1, stanje: 'v_teku' })
    expect(aktualnoKolo(tekme, '2026-09-20')).toEqual({ kolo: 1, stanje: 'v_teku' })
    expect(aktualnoKolo(tekme, '2026-09-21')).toEqual({ kolo: 1, stanje: 'zadnje_odigrano' })
  })

  test('kolo brez terminov ne prevzame vloge naslednjega', () => {
    // Če bi kolo brez datuma veljalo za naslednje, bi razpored obstal na njem.
    const tekme = [...kolo(1, '2026-09-05'), ...kolo(2, null), ...kolo(3, '2026-10-03')]
    expect(aktualnoKolo(tekme, '2026-09-10')).toEqual({ kolo: 3, stanje: 'naslednje' })
  })

  test('brez enega samega termina se ni po čem odločiti', () => {
    expect(aktualnoKolo([], '2026-09-19')).toBe(null)
    expect(aktualnoKolo([...kolo(1, null), ...kolo(2, null)], '2026-09-19')).toBe(null)
  })

  test('tekma brez termina ne pokvari svojega kola', () => {
    const tekme: TerminKola[] = [
      { round_number: 1, scheduled_date: '2026-09-19' },
      { round_number: 1, scheduled_date: null },
    ]
    expect(aktualnoKolo(tekme, '2026-09-19')).toEqual({ kolo: 1, stanje: 'v_teku' })
  })

  test('ob istem datumu v dveh kolih velja nižje kolo', () => {
    const tekme = [...kolo(6, '2026-09-26'), ...kolo(7, '2026-09-26')]
    expect(aktualnoKolo(tekme, '2026-09-26')).toEqual({ kolo: 6, stanje: 'v_teku' })
  })

  test('končnica se obravnava kot vsako drugo kolo', () => {
    // Kola končnice nosijo številke nad rounds_count; motor jih ne loči.
    const tekme = [...kolo(22, '2026-05-15'), ...kolo(23, '2026-05-29'), ...kolo(24, '2026-06-05')]
    expect(aktualnoKolo(tekme, '2026-05-30')).toEqual({ kolo: 24, stanje: 'naslednje' })
  })

  test('nerazvrščen vhod ne vpliva na izid', () => {
    const tekme = [...kolo(3, '2026-10-03'), ...kolo(1, '2026-09-05'), ...kolo(2, '2026-09-19')]
    expect(aktualnoKolo(tekme, '2026-09-19')).toEqual({ kolo: 2, stanje: 'v_teku' })
  })

  test('termin z uro in časovnim zamikom se bere dobesedno', () => {
    // Ura in zamik ne smeta premakniti dneva.
    const tekme = kolo(1, '2026-09-19T23:30:00+00')
    expect(aktualnoKolo(tekme, '2026-09-19')).toEqual({ kolo: 1, stanje: 'v_teku' })
  })
})

describe('oznakaStanjaKola', () => {
  test('vsako stanje ima oznako', () => {
    expect(oznakaStanjaKola('v_teku')).toBe('v teku')
    expect(oznakaStanjaKola('naslednje')).toBe('naslednje')
    expect(oznakaStanjaKola('zadnje_odigrano')).toBe('zadnje odigrano')
  })
})

describe('danesLokalno', () => {
  test('vzame lokalni dan, ne UTC', () => {
    expect(danesLokalno(new Date(2026, 8, 25, 14, 30))).toBe('2026-09-25')
    // Prvi januar ob pol enih ponoči: UTC bi bil še 31. december.
    expect(danesLokalno(new Date(2027, 0, 1, 0, 30))).toBe('2027-01-01')
  })

  test('enomestni mesec in dan dobita vodilno ničlo', () => {
    expect(danesLokalno(new Date(2026, 0, 5, 12, 0))).toBe('2026-01-05')
  })
})
