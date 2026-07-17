import { describe, test, expect } from 'vitest'
import { parseRegistrationRows } from './parseRegistrationXlsx'

const rows: unknown[][] = [
  ['EVIDENCA IN REGISTRACIJA IGRALCEV PO KLUBIH ZA SEZONO 2025/26'],
  [],
  ['Območna balinarska zveza:', '', 'TEST OBZ'],
  ['Balinarski klub:', '', 'BK PRIMER'],
  ['Matična št.:', '', 1234567890],
  ['Davčna št.:', '', 12345678],
  ['Naslov za pošto:', '', 'PRIMER 1'],
  ['Kontaktna oseba:', '', 'JANEZ NOVAK'],
  ['Telefon:', '', '031 000 000'],
  ['Elektronski naslov kluba:', '', 'test@primer.si'],
  ['Predsednik kluba:', '', 'JANEZ NOVAK'],
  [],
  ['Klub', 'Ime', '', 'Priimek', 'Športna št.', 'Spol', 'Datum', 'EMŠO', 'Kraj ', 'Država', 'Državljanstvo', 'Ulica', 'Hišna', 'Poštna', 'Kraj ', 'E-', 'Podpis'],
  ['', '', '', '', 'neobvezno', '', 'rojstva', '', 'rojstva', 'rojstva', '', '', 'številka', 'številka', '', 'Antidoping', ''],
  ['BK PRIMERR', 'PETER', '', 'TESTNI', '', 'M', 32874, '0101990500011', 'LJUBLJANA', 'SLO', 'SLO', 'TESTNA ULICA', 6, 1000, 'MARIBOR', '', ''],
  ['BK PRIMERR', 'MATIJA', '', 'NOVAK', '', 'M', '20.6.2010', '2006010500031', 'LJUBLJANA', 'SLO', 'SLO', 'TESTNA ULICA', 12, 2000, 'LJUBLJANA', '', ''],
  [],
  ['Vodje ekipe na tekmah državnih lig in državnih prvenstev:'],
]

describe('parseRegistrationRows', () => {
  const result = parseRegistrationRows(rows)

  test('prebere klub in sezono iz glave', () => {
    expect(result.club.name).toBe('BK PRIMER')
    expect(result.club.season).toBe('2025/26')
    expect(result.club.email).toBe('test@primer.si')
  })

  test('prebere 2 igralca (ustavi pri "Vodje ekipe")', () => {
    expect(result.players).toHaveLength(2)
  })

  test('sestavi full_name, spol, datum (serijsko in besedilo)', () => {
    const peter = result.players[0]
    expect(peter.fullName).toBe('PETER TESTNI')
    expect(peter.gender).toBe('M')
    expect(peter.birthDate).toBe('1990-01-01')
    expect(peter.emso).toBe('0101990500011')
    expect(peter.birthCity).toBe('LJUBLJANA')
    expect(peter.addressStreet).toBe('TESTNA ULICA')
    expect(peter.addressHouse).toBe('6')
    expect(peter.addressPostal).toBe('1000')
    expect(peter.addressCity).toBe('MARIBOR')

    const matija = result.players[1]
    expect(matija.birthDate).toBe('2010-06-20')
    expect(matija.fullName).toBe('MATIJA NOVAK')
  })

  test('napaka če manjka klub v glavi', () => {
    expect(() => parseRegistrationRows([['nekaj'], ['Klub', 'Ime']]))
      .toThrow(/Balinarski klub/i)
  })
})

const HEAD = [
  ['EVIDENCA IN REGISTRACIJA IGRALCEV PO KLUBIH ZA SEZONO 2025/26'],
  ['Balinarski klub:', '', 'BK PRIMER'],
]

describe('parseRegistrationRows — robustnost', () => {
  test('vrstica z imenom brez priimka: izpuščena + opozorilo', () => {
    const result = parseRegistrationRows([
      ...HEAD,
      ['Klub', 'Ime', '', 'Priimek', 'Športna št.', 'Spol', 'Datum', 'EMŠO', 'Kraj ', 'Država', 'Državljanstvo', 'Ulica', 'Hišna', 'Poštna', 'Kraj ', 'E-', 'Podpis'],
      ['', '', '', '', 'neobvezno', '', 'rojstva', '', 'rojstva', 'rojstva', '', '', 'številka', 'številka', '', 'Antidoping', ''],
      ['BK X', 'JANEZ', '', '', '', 'M', '1.2.1990', '0102990500123', 'KRANJ', 'SLO', 'SLO', 'ULICA', 1, 4000, 'KRANJ', '', ''],
      ['BK X', 'MATIJA', '', 'NOVAK', '', 'M', '20.6.2010', '2006010500031', 'LJUBLJANA', 'SLO', 'SLO', 'TESTNA ULICA', 12, 2000, 'LJUBLJANA', '', ''],
    ])

    expect(result.players).toHaveLength(1)
    expect(result.players[0].fullName).toBe('MATIJA NOVAK')
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatch(/manjka priimek/i)
    expect(result.warnings[0]).toMatch(/JANEZ/)
  })

  test('pod-glava in prazne vrstice ne sprožijo opozorila', () => {
    const result = parseRegistrationRows([
      ...HEAD,
      ['Klub', 'Ime', '', 'Priimek', 'Športna št.', 'Spol', 'Datum', 'EMŠO', 'Kraj ', 'Država', 'Državljanstvo', 'Ulica', 'Hišna', 'Poštna', 'Kraj ', 'E-', 'Podpis'],
      ['', '', '', '', 'neobvezno', '', 'rojstva', '', 'rojstva', 'rojstva', '', '', 'številka', 'številka', '', 'Antidoping', ''],
      ['BK X', 'MATIJA', '', 'NOVAK', '', 'M', '20.6.2010', '2006010500031', 'LJUBLJANA', 'SLO', 'SLO', 'TESTNA ULICA', 12, 2000, 'LJUBLJANA', '', ''],
    ])

    expect(result.players).toHaveLength(1)
    expect(result.warnings).toEqual([])
  })

  test('prazen EMŠO → null', () => {
    const result = parseRegistrationRows([
      ...HEAD,
      ['Klub', 'Ime', '', 'Priimek', 'Športna št.', 'Spol', 'Datum', 'EMŠO', 'Kraj ', 'Država', 'Državljanstvo', 'Ulica', 'Hišna', 'Poštna', 'Kraj ', 'E-', 'Podpis'],
      ['BK X', 'MATIJA', '', 'NOVAK', '', 'M', '20.6.2010', '', 'LJUBLJANA', 'SLO', 'SLO', 'TESTNA ULICA', 12, 2000, 'LJUBLJANA', '', ''],
    ])

    expect(result.players).toHaveLength(1)
    expect(result.players[0].emso).toBeNull()
  })

  test('preslikava po oznakah, ne po indeksu (drugačen vrstni red stolpcev)', () => {
    const result = parseRegistrationRows([
      ...HEAD,
      ['Klub', 'Priimek', 'Ime', 'EMŠO', 'Datum', 'Kraj ', 'Spol', 'Država', 'Državljanstvo', 'Ulica', 'Hišna', 'Poštna', 'Kraj ', 'Športna št.'],
      ['BK X', 'TESTNI', 'PETER', '0101990500011', 32874, 'LJUBLJANA', 'M', 'SLO', 'SLO', 'TESTNA ULICA', 6, 1000, 'MARIBOR', '77'],
    ])

    const p = result.players[0]
    expect(p.fullName).toBe('PETER TESTNI')
    expect(p.gender).toBe('M')
    expect(p.birthDate).toBe('1990-01-01')
    expect(p.emso).toBe('0101990500011')
    expect(p.birthCity).toBe('LJUBLJANA')
    expect(p.addressStreet).toBe('TESTNA ULICA')
    expect(p.addressHouse).toBe('6')
    expect(p.addressPostal).toBe('1000')
    expect(p.addressCity).toBe('MARIBOR')
    expect(p.sportNumber).toBe('77')
  })

  test('prazna vrstica MED igralcema ne prekine branja', () => {
    const result = parseRegistrationRows([
      ...HEAD,
      ['Klub', 'Ime', '', 'Priimek', 'Športna št.', 'Spol', 'Datum', 'EMŠO', 'Kraj ', 'Država', 'Državljanstvo', 'Ulica', 'Hišna', 'Poštna', 'Kraj ', 'E-', 'Podpis'],
      ['BK X', 'PETER', '', 'TESTNI', '', 'M', 32874, '0101990500011', 'LJUBLJANA', 'SLO', 'SLO', 'TESTNA ULICA', 6, 1000, 'MARIBOR', '', ''],
      [],
      ['BK X', 'MATIJA', '', 'NOVAK', '', 'M', '20.6.2010', '2006010500031', 'LJUBLJANA', 'SLO', 'SLO', 'TESTNA ULICA', 12, 2000, 'LJUBLJANA', '', ''],
    ])

    expect(result.players).toHaveLength(2)
    expect(result.players.map((p) => p.fullName)).toEqual(['PETER TESTNI', 'MATIJA NOVAK'])
  })

  test('noga v drugem stolpcu (ne 0 / ne Ime) prav tako ustavi branje', () => {
    const result = parseRegistrationRows([
      ...HEAD,
      ['Klub', 'Ime', '', 'Priimek', 'Športna št.', 'Spol', 'Datum', 'EMŠO', 'Kraj ', 'Država', 'Državljanstvo', 'Ulica', 'Hišna', 'Poštna', 'Kraj ', 'E-', 'Podpis'],
      ['BK X', 'PETER', '', 'TESTNI', '', 'M', 32874, '0101990500011', 'LJUBLJANA', 'SLO', 'SLO', 'TESTNA ULICA', 6, 1000, 'MARIBOR', '', ''],
      ['', '', '', '', '', 'Vodje ekipe na tekmah državnih lig in državnih prvenstev:'],
      ['BK X', 'JOŽE', '', 'VODJA', '', 'M', '1.1.1970', '0101970500111', 'KRANJ', 'SLO', 'SLO', 'ULICA', 1, 4000, 'KRANJ', '', ''],
    ])

    expect(result.players).toHaveLength(1)
    expect(result.players[0].fullName).toBe('PETER TESTNI')
    expect(result.players.some((p) => p.lastName === 'VODJA')).toBe(false)
  })
})
