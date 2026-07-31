import { describe, test, expect } from 'vitest'
import { chooseGoogleEmail } from './googleEmailAdoption'

const google = (email: string) => ({ provider: 'google', identity_data: { email } })
const geslo = (email: string) => ({ provider: 'email', identity_data: { email } })

describe('chooseGoogleEmail', () => {
  test('vrne naslov iz Google identitete', () => {
    expect(chooseGoogleEmail([geslo('a@balinar.app'), google('oseba@gmail.com')], 'a@balinar.app'))
      .toEqual({ ok: true, email: 'oseba@gmail.com' })
  })

  test('zavrne, ce Google identitete ni', () => {
    const r = chooseGoogleEmail([geslo('a@balinar.app')], 'a@balinar.app')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('brez_google_identitete')
  })

  test('zavrne, ce Google identiteta nima naslova', () => {
    const r = chooseGoogleEmail([{ provider: 'google', identity_data: {} }], 'a@balinar.app')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('brez_google_naslova')
  })

  test('zavrne, ce je naslov ze enak', () => {
    const r = chooseGoogleEmail([google('oseba@gmail.com')], 'oseba@gmail.com')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('naslov_ze_enak')
  })

  test('primerjava naslova ne loci velikih in malih crk', () => {
    const r = chooseGoogleEmail([google('Oseba@Gmail.com')], 'oseba@gmail.com')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('naslov_ze_enak')
  })

  test('prazen seznam identitet je zavrnjen', () => {
    const r = chooseGoogleEmail([], 'a@balinar.app')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('brez_google_identitete')
  })

  test('naslov se vrne v mali pisavi', () => {
    expect(chooseGoogleEmail([google('Oseba@Gmail.com')], 'a@balinar.app'))
      .toEqual({ ok: true, email: 'oseba@gmail.com' })
  })
})
