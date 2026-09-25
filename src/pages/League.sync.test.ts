import { describe, test, expect } from 'vitest'

/**
 * Razpored lige se odpre pri kolu, ki je v teku oziroma je naslednje na vrsti.
 *
 * Sezona 1. lige ima 22 kol, z zamiki in končnico še več. Brez skoka se
 * zavihek Razpored odpre pri 1. kolu — spomladi je to pol leta star seznam in
 * si moraš do aktualnega kola drsati sam.
 *
 * Odločitev, katero kolo je aktualno, je v `engines/aktualnoKolo` in ima svoje
 * teste. Ta datoteka varuje drugo polovico: da stran ta motor res uporabi in
 * da ima kolo sidro, na katero se da skočiti. Oboje je v JSX, kjer ga enotski
 * test ne doseže, zato beremo vir.
 */

const viri = import.meta.glob('./*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const STRAN = './League.tsx'

describe('razpored skoči na aktualno kolo', () => {
  test('glob je res kaj prebral', () => {
    expect(viri[STRAN], `datoteke ${STRAN} ni med prebranimi`).toBeDefined()
  })

  test('stran vpraša motor, katero kolo je aktualno', () => {
    expect(viri[STRAN], 'League.tsx ne kliče aktualnoKolo — razpored se bo odprl pri 1. kolu')
      .toMatch(/aktualnoKolo\s*\(/)
  })

  test('dan se vzame po lokalnem času, ne po UTC', () => {
    // `new Date().toISOString()` bi zvečer po 22. uri (poleti) vrnil že
    // naslednji dan in kolo, ki se igra nocoj, bi veljalo za odigrano.
    expect(viri[STRAN], 'za današnji dan uporabi danesLokalno, ne toISOString')
      .toMatch(/danesLokalno\s*\(/)
    const telo = viri[STRAN]
    expect(telo, 'toISOString().slice(0, 10) zamakne dan čez mejo polnoči')
      .not.toMatch(/aktualnoKolo\([^)]*toISOString/)
  })

  test('kolo ima sidro, na katero se da skočiti', () => {
    expect(viri[STRAN], 'kolo mora imeti id, sicer skok nima cilja')
      .toMatch(/id=\{sidroKola\(/)
    expect(viri[STRAN], 'skok mora poiskati sidro kola')
      .toMatch(/getElementById\(sidroKola\(/)
  })

  test('skok ne teče ob vsakem izrisu', () => {
    // Zapisniki se osvežujejo z ozkim refetchem; če bi skok tekel ob vsakem
    // izrisu, bi stran med branjem potegnilo nazaj na aktualno kolo.
    expect(viri[STRAN], 'skok mora biti zabeležen v ref, da se ne ponovi')
      .toMatch(/skocenoNa/)
  })

  test('skok upošteva lepljiv navbar', () => {
    // Navbar je `sticky top-0` z višino h-16; brez odmika bi naslov kola
    // pristal pod njim.
    expect(viri[STRAN], 'odštej višino navbara, sicer kolo pristane pod njim')
      .toMatch(/window\.scrollY\s*-\s*\d+/)
  })
})
