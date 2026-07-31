import { describe, test, expect } from 'vitest'
import { isGenericEmail, GENERIC_EMAIL_DOMAINS } from './genericEmail'

describe('isGenericEmail', () => {
  test('prepozna obe generični domeni', () => {
    expect(isGenericEmail('ime.priimek.a1b2c3d4@balinar.app')).toBe(true)
    expect(isGenericEmail('ime.priimek@bocceapp.si')).toBe(true)
  })

  test('osebni naslovi niso generični', () => {
    expect(isGenericEmail('nekdo@gmail.com')).toBe(false)
    expect(isGenericEmail('nekdo@example.org')).toBe(false)
  })

  test('velike črke ne zmotijo', () => {
    expect(isGenericEmail('Ime.Priimek@BALINAR.APP')).toBe(true)
  })

  test('prazna in manjkajoča vrednost nista generični', () => {
    expect(isGenericEmail('')).toBe(false)
    expect(isGenericEmail(null)).toBe(false)
    expect(isGenericEmail(undefined)).toBe(false)
  })

  test('domena mora biti na koncu, ne kjerkoli', () => {
    expect(isGenericEmail('nekdo@balinar.app.zlonamerno.si')).toBe(false)
    expect(isGenericEmail('balinar.app@gmail.com')).toBe(false)
  })

  test('seznam domen je izvožen in vsebuje obe', () => {
    expect(GENERIC_EMAIL_DOMAINS).toEqual(['balinar.app', 'bocceapp.si'])
  })
})
