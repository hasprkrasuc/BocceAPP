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
