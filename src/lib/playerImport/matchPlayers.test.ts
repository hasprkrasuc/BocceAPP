import { describe, test, expect } from 'vitest'
import { computeStatuses } from './matchPlayers'
import type { ParsedPlayer, ExistingUser } from './types'

const mk = (o: Partial<ParsedPlayer>): ParsedPlayer => ({
  firstName: 'X', lastName: 'Y', fullName: 'X Y', gender: 'M', birthDate: '1990-01-01',
  emso: null, birthYear: 1990, emsoSuffix: null, birthCity: null, birthCountry: null, citizenship: null,
  addressStreet: null, addressHouse: null, addressPostal: null, addressCity: null,
  sportNumber: null, sourceClub: null, sourceCompetition: null, rowIndex: 0, ...o,
})

const eu = (o: Partial<ExistingUser> & { id: string }): ExistingUser => ({
  full_name: null, emso: null, club_id: null, date_of_birth: null,
  birth_year: null, license_number: null, ...o,
})

const CLUB = 'club-primer'

describe('computeStatuses', () => {
  test('nov igralec (EMŠO ni v bazi)', () => {
    const rows = computeStatuses([mk({ emso: '0101990500011' })], [], CLUB)
    expect(rows[0].status).toBe('new')
  })

  test('obstoječ v istem klubu → update', () => {
    const existing: ExistingUser[] = [eu({ id: 'u1', full_name: 'X Y', emso: '0101990500011', club_id: CLUB, date_of_birth: '1990-01-01' })]
    const rows = computeStatuses([mk({ emso: '0101990500011' })], existing, CLUB)
    expect(rows[0].status).toBe('update')
    expect(rows[0].existingUserId).toBe('u1')
  })

  test('obstoječ v drugem klubu → transfer', () => {
    const existing: ExistingUser[] = [eu({ id: 'u1', full_name: 'X Y', emso: '0101990500011', club_id: 'club-drug', date_of_birth: '1990-01-01' })]
    const rows = computeStatuses([mk({ emso: '0101990500011' })], existing, CLUB)
    expect(rows[0].status).toBe('transfer')
    expect(rows[0].currentClubId).toBe('club-drug')
  })

  test('neveljaven EMŠO → ni več error, temveč opozorilo (uvoz se nadaljuje)', () => {
    const rows = computeStatuses([mk({ emso: '123' })], [], CLUB)
    expect(rows[0].status).toBe('new')
    expect(rows[0].warning).toMatch(/kontroln/i)
    expect(rows[0].error).toBeNull()
  })

  test('neveljaven EMŠO, a ujemanje po ENAKI (tipkani) vrednosti EMŠO → update + opozorilo', () => {
    // Klub vsako sezono pošlje isto tipkarsko napako — enakost še vedno ujame igralca.
    const existing: ExistingUser[] = [eu({ id: 'u20', full_name: 'X Y', emso: '123', club_id: CLUB, date_of_birth: '1990-01-01' })]
    const rows = computeStatuses([mk({ emso: '123' })], existing, CLUB)
    expect(rows[0].status).toBe('update')
    expect(rows[0].existingUserId).toBe('u20')
    expect(rows[0].warning).toMatch(/kontroln/i)
  })

  test('brez EMŠO, a ujemanje po imenu+datumu → update', () => {
    const existing: ExistingUser[] = [eu({ id: 'u9', full_name: 'X Y', emso: null, club_id: CLUB, date_of_birth: '1990-01-01' })]
    const rows = computeStatuses([mk({ emso: null })], existing, CLUB)
    expect(rows[0].status).toBe('update')
    expect(rows[0].existingUserId).toBe('u9')
  })

  test('brez EMŠO in brez ujemanja → new', () => {
    const rows = computeStatuses([mk({ emso: null, fullName: 'Nova Oseba', birthDate: '2001-02-03' })], [], CLUB)
    expect(rows[0].status).toBe('new')
  })

  test('fallback ujemanje po imenu je neobčutljivo na šumnike/velike črke', () => {
    const existing: ExistingUser[] = [eu({ id: 'u10', full_name: 'Žiga Kovač', emso: null, club_id: CLUB, date_of_birth: '2012-01-01' })]
    const rows = computeStatuses(
      [mk({ emso: null, fullName: 'ŽIGA KOVAČ', birthDate: '2012-01-01' })],
      existing,
      CLUB,
    )
    expect(rows[0].status).toBe('update')
    expect(rows[0].existingUserId).toBe('u10')
  })

  test('fallback se NE ujema, če se datum rojstva razlikuje', () => {
    const existing: ExistingUser[] = [eu({ id: 'u11', full_name: 'Žiga Kovač', emso: null, club_id: CLUB, date_of_birth: '1999-01-01' })]
    const rows = computeStatuses(
      [mk({ emso: null, fullName: 'ŽIGA KOVAČ', birthDate: '2012-01-01' })],
      existing,
      CLUB,
    )
    expect(rows[0].status).toBe('new')
  })

  test('brez EMŠO in brez datuma rojstva → error (ne ujemanje po samem imenu)', () => {
    // null === null bi se sicer izšlo in bi se ujeli zgolj po imenu; strežnik tako vrstico preskoči.
    const existing: ExistingUser[] = [eu({ id: 'u13', full_name: 'X Y', emso: null, club_id: CLUB, date_of_birth: null })]
    const rows = computeStatuses([mk({ emso: null, birthDate: null, birthYear: null })], existing, CLUB)
    expect(rows[0].status).toBe('error')
    expect(rows[0].error).toBe('Brez EMŠO in datuma rojstva')
    expect(rows[0].existingUserId).toBeNull()
  })

  test('brez EMŠO, več kandidatov z istim imenom in datumom → error (ne ugibaj prvega)', () => {
    const existing: ExistingUser[] = [
      eu({ id: 'u14', full_name: 'Žiga Kovač', emso: null, club_id: CLUB, date_of_birth: '2012-01-01' }),
      eu({ id: 'u15', full_name: 'ZIGA KOVAC', emso: null, club_id: 'club-drug', date_of_birth: '2012-01-01' }),
    ]
    const rows = computeStatuses([mk({ emso: null, fullName: 'Žiga Kovač', birthDate: '2012-01-01' })], existing, CLUB)
    expect(rows[0].status).toBe('error')
    expect(rows[0].error).toMatch(/Več kandidatov/)
    expect(rows[0].existingUserId).toBeNull()
  })

  // --- zamaskiran izvoz iz evidence: brez EMŠO in brez polnega datuma, le letnica ---

  test('zamaskirano: ujemanje po imenu in letnici → update', () => {
    const existing: ExistingUser[] = [eu({ id: 'u30', full_name: 'Bojan Vidali', club_id: CLUB, date_of_birth: '1959-05-12', birth_year: 1959 })]
    const rows = computeStatuses(
      [mk({ fullName: 'BOJAN VIDALI', emso: null, birthDate: null, birthYear: 1959 })],
      existing, CLUB,
    )
    expect(rows[0].status).toBe('update')
    expect(rows[0].existingUserId).toBe('u30')
  })

  test('zamaskirano: igralca ni v bazi → error (novega NE ustvarimo)', () => {
    const rows = computeStatuses(
      [mk({ fullName: 'Nihče Neznani', emso: null, birthDate: null, birthYear: 1959 })],
      [], CLUB,
    )
    expect(rows[0].status).toBe('error')
    expect(rows[0].error).toMatch(/ni v bazi/i)
    expect(rows[0].existingUserId).toBeNull()
  })

  test('zamaskirano: dva soimenjaka iste letnice → error (ne ugibaj)', () => {
    const existing: ExistingUser[] = [
      eu({ id: 'u31', full_name: 'Martin Novak', club_id: CLUB, birth_year: 1976 }),
      eu({ id: 'u32', full_name: 'MARTIN NOVAK', club_id: 'club-drug', birth_year: 1976 }),
    ]
    const rows = computeStatuses(
      [mk({ fullName: 'Martin Novak', emso: null, birthDate: null, birthYear: 1976 })],
      existing, CLUB,
    )
    expect(rows[0].status).toBe('error')
    expect(rows[0].error).toMatch(/letnico/i)
  })

  test('zamaskirano: soimenjaka razloči ostanek EMŠO', () => {
    const existing: ExistingUser[] = [
      eu({ id: 'u31', full_name: 'Martin Novak', emso: '1201976500026', club_id: CLUB, birth_year: 1976 }),
      eu({ id: 'u32', full_name: 'Martin Novak', emso: '1201976500127', club_id: CLUB, birth_year: 1976 }),
    ]
    const rows = computeStatuses(
      [mk({ fullName: 'Martin Novak', emso: null, birthDate: null, birthYear: 1976, emsoSuffix: '0127' })],
      existing, CLUB,
    )
    expect(rows[0].status).toBe('update')
    expect(rows[0].existingUserId).toBe('u32')
  })

  test('zamaskirano: soimenjaka razloči športna številka', () => {
    const existing: ExistingUser[] = [
      eu({ id: 'u31', full_name: 'Martin Novak', club_id: CLUB, birth_year: 1976, license_number: '111' }),
      eu({ id: 'u32', full_name: 'Martin Novak', club_id: CLUB, birth_year: 1976, license_number: '222' }),
    ]
    const rows = computeStatuses(
      [mk({ fullName: 'Martin Novak', emso: null, birthDate: null, birthYear: 1976, sportNumber: '222' })],
      existing, CLUB,
    )
    expect(rows[0].status).toBe('update')
    expect(rows[0].existingUserId).toBe('u32')
  })

  test('zamaskirano: razločevalec, ki ne zadene nikogar, nabora ne izprazni', () => {
    // Obstoječi zapis brez številke licence ne sme izpasti samo zato, ker jo izvoz ima.
    const existing: ExistingUser[] = [eu({ id: 'u33', full_name: 'Ana Kos', club_id: CLUB, birth_year: 1990 })]
    const rows = computeStatuses(
      [mk({ fullName: 'Ana Kos', emso: null, birthDate: null, birthYear: 1990, sportNumber: '999', emsoSuffix: '4321' })],
      existing, CLUB,
    )
    expect(rows[0].status).toBe('update')
    expect(rows[0].existingUserId).toBe('u33')
  })

  test('zamaskirano: obstoječ v drugem klubu → transfer', () => {
    const existing: ExistingUser[] = [eu({ id: 'u34', full_name: 'Ana Kos', club_id: 'club-drug', birth_year: 1990 })]
    const rows = computeStatuses(
      [mk({ fullName: 'Ana Kos', emso: null, birthDate: null, birthYear: 1990 })],
      existing, CLUB,
    )
    expect(rows[0].status).toBe('transfer')
    expect(rows[0].currentClubId).toBe('club-drug')
  })

  test('obstoječ uporabnik brez kluba (club_id null), ujemanje po EMŠO → update (ne transfer)', () => {
    const existing: ExistingUser[] = [eu({ id: 'u12', full_name: 'X Y', emso: '0101990500011', club_id: null, date_of_birth: '1990-01-01' })]
    const rows = computeStatuses([mk({ emso: '0101990500011' })], existing, CLUB)
    expect(rows[0].status).toBe('update')
    expect(rows[0].existingUserId).toBe('u12')
  })
})
