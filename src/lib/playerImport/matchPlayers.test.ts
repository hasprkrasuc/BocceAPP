import { describe, test, expect } from 'vitest'
import { computeStatuses } from './matchPlayers'
import type { ParsedPlayer, ExistingUser } from './types'

const mk = (o: Partial<ParsedPlayer>): ParsedPlayer => ({
  firstName: 'X', lastName: 'Y', fullName: 'X Y', gender: 'M', birthDate: '1990-01-01',
  emso: null, birthCity: null, birthCountry: null, citizenship: null,
  addressStreet: null, addressHouse: null, addressPostal: null, addressCity: null,
  sportNumber: null, rowIndex: 0, ...o,
})

const CLUB = 'club-primer'

describe('computeStatuses', () => {
  test('nov igralec (EMŠO ni v bazi)', () => {
    const rows = computeStatuses([mk({ emso: '0101990500011' })], [], CLUB)
    expect(rows[0].status).toBe('new')
  })

  test('obstoječ v istem klubu → update', () => {
    const existing: ExistingUser[] = [{ id: 'u1', full_name: 'X Y', emso: '0101990500011', club_id: CLUB, date_of_birth: '1990-01-01' }]
    const rows = computeStatuses([mk({ emso: '0101990500011' })], existing, CLUB)
    expect(rows[0].status).toBe('update')
    expect(rows[0].existingUserId).toBe('u1')
  })

  test('obstoječ v drugem klubu → transfer', () => {
    const existing: ExistingUser[] = [{ id: 'u1', full_name: 'X Y', emso: '0101990500011', club_id: 'club-drug', date_of_birth: '1990-01-01' }]
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
    const existing: ExistingUser[] = [{ id: 'u20', full_name: 'X Y', emso: '123', club_id: CLUB, date_of_birth: '1990-01-01' }]
    const rows = computeStatuses([mk({ emso: '123' })], existing, CLUB)
    expect(rows[0].status).toBe('update')
    expect(rows[0].existingUserId).toBe('u20')
    expect(rows[0].warning).toMatch(/kontroln/i)
  })

  test('brez EMŠO, a ujemanje po imenu+datumu → update', () => {
    const existing: ExistingUser[] = [{ id: 'u9', full_name: 'X Y', emso: null, club_id: CLUB, date_of_birth: '1990-01-01' }]
    const rows = computeStatuses([mk({ emso: null })], existing, CLUB)
    expect(rows[0].status).toBe('update')
    expect(rows[0].existingUserId).toBe('u9')
  })

  test('brez EMŠO in brez ujemanja → new', () => {
    const rows = computeStatuses([mk({ emso: null, fullName: 'Nova Oseba', birthDate: '2001-02-03' })], [], CLUB)
    expect(rows[0].status).toBe('new')
  })

  test('fallback ujemanje po imenu je neobčutljivo na šumnike/velike črke', () => {
    const existing: ExistingUser[] = [{ id: 'u10', full_name: 'Žiga Kovač', emso: null, club_id: CLUB, date_of_birth: '2012-01-01' }]
    const rows = computeStatuses(
      [mk({ emso: null, fullName: 'ŽIGA KOVAČ', birthDate: '2012-01-01' })],
      existing,
      CLUB,
    )
    expect(rows[0].status).toBe('update')
    expect(rows[0].existingUserId).toBe('u10')
  })

  test('fallback se NE ujema, če se datum rojstva razlikuje', () => {
    const existing: ExistingUser[] = [{ id: 'u11', full_name: 'Žiga Kovač', emso: null, club_id: CLUB, date_of_birth: '1999-01-01' }]
    const rows = computeStatuses(
      [mk({ emso: null, fullName: 'ŽIGA KOVAČ', birthDate: '2012-01-01' })],
      existing,
      CLUB,
    )
    expect(rows[0].status).toBe('new')
  })

  test('brez EMŠO in brez datuma rojstva → error (ne ujemanje po samem imenu)', () => {
    // null === null bi se sicer izšlo in bi se ujeli zgolj po imenu; strežnik tako vrstico preskoči.
    const existing: ExistingUser[] = [{ id: 'u13', full_name: 'X Y', emso: null, club_id: CLUB, date_of_birth: null }]
    const rows = computeStatuses([mk({ emso: null, birthDate: null })], existing, CLUB)
    expect(rows[0].status).toBe('error')
    expect(rows[0].error).toBe('Brez EMŠO in datuma rojstva')
    expect(rows[0].existingUserId).toBeNull()
  })

  test('brez EMŠO, več kandidatov z istim imenom in datumom → error (ne ugibaj prvega)', () => {
    const existing: ExistingUser[] = [
      { id: 'u14', full_name: 'Žiga Kovač', emso: null, club_id: CLUB, date_of_birth: '2012-01-01' },
      { id: 'u15', full_name: 'ZIGA KOVAC', emso: null, club_id: 'club-drug', date_of_birth: '2012-01-01' },
    ]
    const rows = computeStatuses([mk({ emso: null, fullName: 'Žiga Kovač', birthDate: '2012-01-01' })], existing, CLUB)
    expect(rows[0].status).toBe('error')
    expect(rows[0].error).toMatch(/Več kandidatov/)
    expect(rows[0].existingUserId).toBeNull()
  })

  test('obstoječ uporabnik brez kluba (club_id null), ujemanje po EMŠO → update (ne transfer)', () => {
    const existing: ExistingUser[] = [{ id: 'u12', full_name: 'X Y', emso: '0101990500011', club_id: null, date_of_birth: '1990-01-01' }]
    const rows = computeStatuses([mk({ emso: '0101990500011' })], existing, CLUB)
    expect(rows[0].status).toBe('update')
    expect(rows[0].existingUserId).toBe('u12')
  })
})
