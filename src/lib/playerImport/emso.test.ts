import { describe, test, expect } from 'vitest'
import {
  isValidEmso, normalizeEmso, isValidOib, isValidPersonalId,
  datumIzEmso, opozoriloOEmso,
} from './emso'

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

describe('isValidOib — tuje oznake', () => {
  // Vse številke so izmišljene in izračunane, ne pripadajo nikomur.
  test('prepozna veljavno kontrolno števko po ISO 7064 MOD 11,10', () => {
    expect(isValidOib('12345678903')).toBe(true)
    expect(isValidOib('98765432106')).toBe(true)
    expect(isValidOib('00000000001')).toBe(true)
  })

  test('napačna kontrolna števka ni veljavna', () => {
    expect(isValidOib('12345678904')).toBe(false)
    expect(isValidOib('98765432100')).toBe(false)
  })

  test('napačna dolžina ni OIB', () => {
    expect(isValidOib('1234567890')).toBe(false)     // 10
    expect(isValidOib('123456789031')).toBe(false)   // 12
    expect(isValidOib('')).toBe(false)
    expect(isValidOib(null)).toBe(false)
  })

  test('EMŠO ni OIB in obratno', () => {
    // 13-mestni EMŠO se ne sme prebrati kot OIB samo zato, ker so same števke.
    expect(isValidOib('2006010500031')).toBe(false)
    expect(isValidEmso('12345678903')).toBe(false)
  })
})

describe('isValidPersonalId', () => {
  test('sprejme slovenski EMŠO in tujo oznako', () => {
    expect(isValidPersonalId('2006010500031')).toBe(true)
    expect(isValidPersonalId('12345678903')).toBe(true)
  })

  test('zavrne pokvarjeno vrednost', () => {
    expect(isValidPersonalId('1.70196E+12')).toBe(false)
    expect(isValidPersonalId('2908967500')).toBe(false)
    expect(isValidPersonalId(null)).toBe(false)
  })
})

describe('datumIzEmso', () => {
  test('prebere datum iz prvih sedmih števk', () => {
    expect(datumIzEmso('2006010500031')).toBe('2010-06-20')
    expect(datumIzEmso('0806009500108')).toBe('2009-06-08')
  })

  test('trimestna letnica loči stoletji', () => {
    // 9xx je 19xx, 0xx pa 20xx.
    expect(datumIzEmso('1203967500080')).toBe('1967-03-12')
    expect(datumIzEmso('2510008505042')).toBe('2008-10-25')
  })

  test('nemogoč datum vrne null, ne prevaljenega v naslednji mesec', () => {
    // Date bi 31. februar tiho premaknil na 2. ali 3. marec.
    expect(datumIzEmso('3102000500017')).toBeNull()
    expect(datumIzEmso('0013000500017')).toBeNull()
  })

  test('tuja oznaka nima kodiranega datuma', () => {
    expect(datumIzEmso('12345678903')).toBeNull()
    expect(datumIzEmso(null)).toBeNull()
  })
})

describe('opozoriloOEmso', () => {
  test('pravilen EMŠO z ujemajočim datumom ne opozarja', () => {
    expect(opozoriloOEmso('0806009500108', '2009-06-08')).toBeNull()
  })

  test('slovenska oblika datuma ne sproži lažnega opozorila', () => {
    // V bazi sta obe obliki; brez razčlenitve bi vsaka d.m.yyyy lažno opozarjala.
    expect(opozoriloOEmso('0806009500108', '08.06.2009')).toBeNull()
  })

  test('neujemanje datuma pove obe vrednosti', () => {
    // Natanko primer, zaradi katerega je to opozorilo nastalo: ena sama napačna števka.
    const o = opozoriloOEmso('0806009500108', '2009-06-06')
    expect(o).toMatch(/2009-06-08/)
    expect(o).toMatch(/2009-06-06/)
  })

  test('neveljavna kontrolna števka se javi pred primerjavo datuma', () => {
    expect(opozoriloOEmso('0606009500108', '2009-06-06')).toMatch(/kontrolna števka/i)
  })

  test('pokvarjen zapis pove, koliko števk je', () => {
    expect(opozoriloOEmso('2908967500', '1976-08-29')).toMatch(/10 števk/)
  })

  test('tuja oznaka z veljavno kontrolno ne opozarja, čeprav datuma ne kodira', () => {
    expect(opozoriloOEmso('12345678903', '1965-12-04')).toBeNull()
  })

  test('brez EMŠO ni opozorila', () => {
    expect(opozoriloOEmso(null, '2009-06-08')).toBeNull()
    expect(opozoriloOEmso('', '2009-06-08')).toBeNull()
  })

  test('brez datuma rojstva se preveri samo oblika in kontrolna', () => {
    expect(opozoriloOEmso('0806009500108', null)).toBeNull()
  })
})
