import { describe, test, expect } from 'vitest'
import { parseBirthDate } from './parseDate'

describe('parseBirthDate', () => {
  test('Excel serijska številka → YYYY-MM-DD', () => {
    expect(parseBirthDate(32874)).toBe('1990-01-01')
    expect(parseBirthDate(27456)).toBe('1975-03-03')
  })
  test('besedilo d.m.yyyy → YYYY-MM-DD', () => {
    expect(parseBirthDate('6.5.2010')).toBe('2010-05-06')
    expect(parseBirthDate('2.02.1962')).toBe('1962-02-02')
    expect(parseBirthDate('14.09.1962')).toBe('1962-09-14')
  })
  test('že v ISO obliki → nespremenjeno', () => {
    expect(parseBirthDate('1962-02-02')).toBe('1962-02-02')
  })
  test('prazno/neveljavno → null', () => {
    expect(parseBirthDate('')).toBeNull()
    expect(parseBirthDate(null)).toBeNull()
    expect(parseBirthDate('nekaj')).toBeNull()
  })
})
