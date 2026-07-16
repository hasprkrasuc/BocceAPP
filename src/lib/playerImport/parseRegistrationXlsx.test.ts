import { describe, test, expect } from 'vitest'
import { parseRegistrationRows } from './parseRegistrationXlsx'

const rows: unknown[][] = [
  ['EVIDENCA IN REGISTRACIJA IGRALCEV PO KLUBIH ZA SEZONO 2025/26'],
  [],
  ['Območna balinarska zveza:', '', 'NOBZ'],
  ['Balinarski klub:', '', 'BK BEGUNJE'],
  ['Matična št.:', '', 5228450000],
  ['Davčna št.:', '', 43122043],
  ['Naslov za pošto:', '', 'BEGUNJE 46'],
  ['Kontaktna oseba:', '', 'ANTON KLUČAR'],
  ['Telefon:', '', '031 540 491'],
  ['Elektronski naslov kluba:', '', 'bk.begunje@gmail.com'],
  ['Predsednik kluba:', '', 'ANTON KLUČAR'],
  [],
  ['Klub', 'Ime', '', 'Priimek', 'Športna št.', 'Spol', 'Datum', 'EMŠO', 'Kraj ', 'Država', 'Državljanstvo', 'Ulica', 'Hišna', 'Poštna', 'Kraj ', 'E-', 'Podpis'],
  ['', '', '', '', 'neobvezno', '', 'rojstva', '', 'rojstva', 'rojstva', '', '', 'številka', 'številka', '', 'Antidoping', ''],
  ['BK BEGUNJUE', 'NIK ', '', 'GRUDEN HITI', '', 'M', 38515, '1206005500150', 'POSTOJNA', 'SLO', 'SLO', 'POPKOVA', 6, 1380, 'CERKNICA', '', ''],
  ['BK BEGUNJUE', 'ALJAŽ', '', 'MATKO', '', 'M', '6.5.2010', '0605010500353', 'POSTOJNA', 'SLO', 'SLO', 'BEGUNJE', 12, 1382, 'BEGUNJE', '', ''],
  [],
  ['Vodje ekipe na tekmah državnih lig in državnih prvenstev:'],
]

describe('parseRegistrationRows', () => {
  const result = parseRegistrationRows(rows)

  test('prebere klub in sezono iz glave', () => {
    expect(result.club.name).toBe('BK BEGUNJE')
    expect(result.club.season).toBe('2025/26')
    expect(result.club.email).toBe('bk.begunje@gmail.com')
  })

  test('prebere 2 igralca (ustavi pri "Vodje ekipe")', () => {
    expect(result.players).toHaveLength(2)
  })

  test('sestavi full_name, spol, datum (serijsko in besedilo)', () => {
    const nik = result.players[0]
    expect(nik.fullName).toBe('NIK GRUDEN HITI')
    expect(nik.gender).toBe('M')
    expect(nik.birthDate).toBe('2005-06-12')
    expect(nik.emso).toBe('1206005500150')
    expect(nik.birthCity).toBe('POSTOJNA')
    expect(nik.addressStreet).toBe('POPKOVA')
    expect(nik.addressHouse).toBe('6')
    expect(nik.addressPostal).toBe('1380')
    expect(nik.addressCity).toBe('CERKNICA')

    const aljaz = result.players[1]
    expect(aljaz.birthDate).toBe('2010-05-06')
    expect(aljaz.fullName).toBe('ALJAŽ MATKO')
  })

  test('napaka če manjka klub v glavi', () => {
    expect(() => parseRegistrationRows([['nekaj'], ['Klub', 'Ime']]))
      .toThrow(/Balinarski klub/i)
  })
})

const HEAD = [
  ['EVIDENCA IN REGISTRACIJA IGRALCEV PO KLUBIH ZA SEZONO 2025/26'],
  ['Balinarski klub:', '', 'BK BEGUNJE'],
]

describe('parseRegistrationRows — robustnost', () => {
  test('vrstica z imenom brez priimka: izpuščena + opozorilo', () => {
    const result = parseRegistrationRows([
      ...HEAD,
      ['Klub', 'Ime', '', 'Priimek', 'Športna št.', 'Spol', 'Datum', 'EMŠO', 'Kraj ', 'Država', 'Državljanstvo', 'Ulica', 'Hišna', 'Poštna', 'Kraj ', 'E-', 'Podpis'],
      ['', '', '', '', 'neobvezno', '', 'rojstva', '', 'rojstva', 'rojstva', '', '', 'številka', 'številka', '', 'Antidoping', ''],
      ['BK X', 'JANEZ', '', '', '', 'M', '1.2.1990', '0102990500123', 'KRANJ', 'SLO', 'SLO', 'ULICA', 1, 4000, 'KRANJ', '', ''],
      ['BK X', 'ALJAŽ', '', 'MATKO', '', 'M', '6.5.2010', '0605010500353', 'POSTOJNA', 'SLO', 'SLO', 'BEGUNJE', 12, 1382, 'BEGUNJE', '', ''],
    ])

    expect(result.players).toHaveLength(1)
    expect(result.players[0].fullName).toBe('ALJAŽ MATKO')
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatch(/manjka priimek/i)
    expect(result.warnings[0]).toMatch(/JANEZ/)
  })

  test('pod-glava in prazne vrstice ne sprožijo opozorila', () => {
    const result = parseRegistrationRows([
      ...HEAD,
      ['Klub', 'Ime', '', 'Priimek', 'Športna št.', 'Spol', 'Datum', 'EMŠO', 'Kraj ', 'Država', 'Državljanstvo', 'Ulica', 'Hišna', 'Poštna', 'Kraj ', 'E-', 'Podpis'],
      ['', '', '', '', 'neobvezno', '', 'rojstva', '', 'rojstva', 'rojstva', '', '', 'številka', 'številka', '', 'Antidoping', ''],
      ['BK X', 'ALJAŽ', '', 'MATKO', '', 'M', '6.5.2010', '0605010500353', 'POSTOJNA', 'SLO', 'SLO', 'BEGUNJE', 12, 1382, 'BEGUNJE', '', ''],
    ])

    expect(result.players).toHaveLength(1)
    expect(result.warnings).toEqual([])
  })

  test('prazen EMŠO → null', () => {
    const result = parseRegistrationRows([
      ...HEAD,
      ['Klub', 'Ime', '', 'Priimek', 'Športna št.', 'Spol', 'Datum', 'EMŠO', 'Kraj ', 'Država', 'Državljanstvo', 'Ulica', 'Hišna', 'Poštna', 'Kraj ', 'E-', 'Podpis'],
      ['BK X', 'ALJAŽ', '', 'MATKO', '', 'M', '6.5.2010', '', 'POSTOJNA', 'SLO', 'SLO', 'BEGUNJE', 12, 1382, 'BEGUNJE', '', ''],
    ])

    expect(result.players).toHaveLength(1)
    expect(result.players[0].emso).toBeNull()
  })

  test('preslikava po oznakah, ne po indeksu (drugačen vrstni red stolpcev)', () => {
    const result = parseRegistrationRows([
      ...HEAD,
      ['Klub', 'Priimek', 'Ime', 'EMŠO', 'Datum', 'Kraj ', 'Spol', 'Država', 'Državljanstvo', 'Ulica', 'Hišna', 'Poštna', 'Kraj ', 'Športna št.'],
      ['BK X', 'GRUDEN HITI', 'NIK', '1206005500150', 38515, 'POSTOJNA', 'M', 'SLO', 'SLO', 'POPKOVA', 6, 1380, 'CERKNICA', '77'],
    ])

    const p = result.players[0]
    expect(p.fullName).toBe('NIK GRUDEN HITI')
    expect(p.gender).toBe('M')
    expect(p.birthDate).toBe('2005-06-12')
    expect(p.emso).toBe('1206005500150')
    expect(p.birthCity).toBe('POSTOJNA')
    expect(p.addressStreet).toBe('POPKOVA')
    expect(p.addressHouse).toBe('6')
    expect(p.addressPostal).toBe('1380')
    expect(p.addressCity).toBe('CERKNICA')
    expect(p.sportNumber).toBe('77')
  })

  test('prazna vrstica MED igralcema ne prekine branja', () => {
    const result = parseRegistrationRows([
      ...HEAD,
      ['Klub', 'Ime', '', 'Priimek', 'Športna št.', 'Spol', 'Datum', 'EMŠO', 'Kraj ', 'Država', 'Državljanstvo', 'Ulica', 'Hišna', 'Poštna', 'Kraj ', 'E-', 'Podpis'],
      ['BK X', 'NIK', '', 'GRUDEN HITI', '', 'M', 38515, '1206005500150', 'POSTOJNA', 'SLO', 'SLO', 'POPKOVA', 6, 1380, 'CERKNICA', '', ''],
      [],
      ['BK X', 'ALJAŽ', '', 'MATKO', '', 'M', '6.5.2010', '0605010500353', 'POSTOJNA', 'SLO', 'SLO', 'BEGUNJE', 12, 1382, 'BEGUNJE', '', ''],
    ])

    expect(result.players).toHaveLength(2)
    expect(result.players.map((p) => p.fullName)).toEqual(['NIK GRUDEN HITI', 'ALJAŽ MATKO'])
  })

  test('noga v drugem stolpcu (ne 0 / ne Ime) prav tako ustavi branje', () => {
    const result = parseRegistrationRows([
      ...HEAD,
      ['Klub', 'Ime', '', 'Priimek', 'Športna št.', 'Spol', 'Datum', 'EMŠO', 'Kraj ', 'Država', 'Državljanstvo', 'Ulica', 'Hišna', 'Poštna', 'Kraj ', 'E-', 'Podpis'],
      ['BK X', 'NIK', '', 'GRUDEN HITI', '', 'M', 38515, '1206005500150', 'POSTOJNA', 'SLO', 'SLO', 'POPKOVA', 6, 1380, 'CERKNICA', '', ''],
      ['', '', '', '', '', 'Vodje ekipe na tekmah državnih lig in državnih prvenstev:'],
      ['BK X', 'JOŽE', '', 'VODJA', '', 'M', '1.1.1970', '0101970500111', 'KRANJ', 'SLO', 'SLO', 'ULICA', 1, 4000, 'KRANJ', '', ''],
    ])

    expect(result.players).toHaveLength(1)
    expect(result.players[0].fullName).toBe('NIK GRUDEN HITI')
    expect(result.players.some((p) => p.lastName === 'VODJA')).toBe(false)
  })
})
