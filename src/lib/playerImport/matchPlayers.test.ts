import { describe, test, expect } from 'vitest'
import { computeStatuses } from './matchPlayers'
import type { ParsedPlayer, ExistingUser } from './types'

const mk = (o: Partial<ParsedPlayer>): ParsedPlayer => ({
  firstName: 'X', lastName: 'Y', fullName: 'X Y', gender: 'M', birthDate: '1990-01-01',
  emso: null, birthCity: null, birthCountry: null, citizenship: null,
  addressStreet: null, addressHouse: null, addressPostal: null, addressCity: null,
  sportNumber: null, rowIndex: 0, ...o,
})

const CLUB = 'club-begunje'

describe('computeStatuses', () => {
  test('nov igralec (EMŠO ni v bazi)', () => {
    const rows = computeStatuses([mk({ emso: '1206005500150' })], [], CLUB)
    expect(rows[0].status).toBe('new')
  })

  test('obstoječ v istem klubu → update', () => {
    const existing: ExistingUser[] = [{ id: 'u1', full_name: 'X Y', emso: '1206005500150', club_id: CLUB, date_of_birth: '1990-01-01' }]
    const rows = computeStatuses([mk({ emso: '1206005500150' })], existing, CLUB)
    expect(rows[0].status).toBe('update')
    expect(rows[0].existingUserId).toBe('u1')
  })

  test('obstoječ v drugem klubu → transfer', () => {
    const existing: ExistingUser[] = [{ id: 'u1', full_name: 'X Y', emso: '1206005500150', club_id: 'club-drug', date_of_birth: '1990-01-01' }]
    const rows = computeStatuses([mk({ emso: '1206005500150' })], existing, CLUB)
    expect(rows[0].status).toBe('transfer')
    expect(rows[0].currentClubId).toBe('club-drug')
  })

  test('neveljaven EMŠO → error', () => {
    const rows = computeStatuses([mk({ emso: '123' })], [], CLUB)
    expect(rows[0].status).toBe('error')
    expect(rows[0].error).toMatch(/EMŠO/i)
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
    const existing: ExistingUser[] = [{ id: 'u10', full_name: 'Žan Dajčman', emso: null, club_id: CLUB, date_of_birth: '2012-01-01' }]
    const rows = computeStatuses(
      [mk({ emso: null, fullName: 'ŽAN DAJČMAN', birthDate: '2012-01-01' })],
      existing,
      CLUB,
    )
    expect(rows[0].status).toBe('update')
    expect(rows[0].existingUserId).toBe('u10')
  })

  test('fallback se NE ujema, če se datum rojstva razlikuje', () => {
    const existing: ExistingUser[] = [{ id: 'u11', full_name: 'Žan Dajčman', emso: null, club_id: CLUB, date_of_birth: '1999-01-01' }]
    const rows = computeStatuses(
      [mk({ emso: null, fullName: 'ŽAN DAJČMAN', birthDate: '2012-01-01' })],
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
      { id: 'u14', full_name: 'Žan Dajčman', emso: null, club_id: CLUB, date_of_birth: '2012-01-01' },
      { id: 'u15', full_name: 'ZAN DAJCMAN', emso: null, club_id: 'club-drug', date_of_birth: '2012-01-01' },
    ]
    const rows = computeStatuses([mk({ emso: null, fullName: 'Žan Dajčman', birthDate: '2012-01-01' })], existing, CLUB)
    expect(rows[0].status).toBe('error')
    expect(rows[0].error).toMatch(/Več kandidatov/)
    expect(rows[0].existingUserId).toBeNull()
  })

  test('obstoječ uporabnik brez kluba (club_id null), ujemanje po EMŠO → update (ne transfer)', () => {
    const existing: ExistingUser[] = [{ id: 'u12', full_name: 'X Y', emso: '1206005500150', club_id: null, date_of_birth: '1990-01-01' }]
    const rows = computeStatuses([mk({ emso: '1206005500150' })], existing, CLUB)
    expect(rows[0].status).toBe('update')
    expect(rows[0].existingUserId).toBe('u12')
  })
})
