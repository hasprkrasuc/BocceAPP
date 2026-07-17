import { describe, test, expect } from 'vitest'
import { isValidEmso, normalizeEmso } from './emso'

describe('normalizeEmso', () => {
  test('število v niz z vodilnimi ničlami do 13 mest', () => {
    expect(normalizeEmso(1505985500124)).toBe('1505985500124')
  })
  test('odstrani presledke in ne-števke', () => {
    expect(normalizeEmso(' 0101990500011 ')).toBe('0101990500011')
  })
  test('prazno → prazen niz', () => {
    expect(normalizeEmso('')).toBe('')
    expect(normalizeEmso(null as unknown as string)).toBe('')
  })
})

describe('isValidEmso', () => {
  test('veljaven EMŠO (pravilna kontrolna števka)', () => {
    expect(isValidEmso('0101990500011')).toBe(true)
    expect(isValidEmso('1505985500124')).toBe(true)
  })
  test('napačna dolžina → neveljaven', () => {
    expect(isValidEmso('12345')).toBe(false)
    expect(isValidEmso('01019905000119')).toBe(false)
  })
  test('napačna kontrolna števka → neveljaven', () => {
    expect(isValidEmso('0101990500012')).toBe(false)
  })
  test('neštevilski znaki → neveljaven', () => {
    expect(isValidEmso('01019905000AB')).toBe(false)
  })
  test('m=10 (vsota mod 11 = 1) → kontrolna števka je 0, EMŠO je VELJAVEN', () => {
    // 0101990501000: uteženа vsota 89 → 89 mod 11 = 1 → m = 10 → K = 0 ✓
    expect(isValidEmso('0101990501000')).toBe(true)
  })
})
