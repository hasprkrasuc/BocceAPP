import { describe, test, expect } from 'vitest'
import {
  napakaNovegaGesla, opozoriloOGenericnemNaslovu, NAJMANJ_ZNAKOV, SPOROCILO_POSLANO,
} from './ponastavitevGesla'

describe('napakaNovegaGesla', () => {
  test('prekratko geslo zavrne in pove mejo', () => {
    expect(napakaNovegaGesla('kratko', 'kratko')).toMatch(new RegExp(`${NAJMANJ_ZNAKOV} znakov`))
  })

  test('neujemajoči gesli zavrne', () => {
    expect(napakaNovegaGesla('dovoljdolgo', 'dovoljDolgo')).toBe('Gesli se ne ujemata')
  })

  test('dolžina se preveri pred ujemanjem', () => {
    // Sicer bi človek pri dveh napakah hkrati videl le "gesli se ne ujemata"
    // in popravljal napačno stvar.
    expect(napakaNovegaGesla('kratko', 'drugo')).toMatch(/znakov/)
  })

  test('veljavno geslo nima napake', () => {
    expect(napakaNovegaGesla('dovoljdolgo', 'dovoljdolgo')).toBeNull()
  })
})

describe('opozoriloOGenericnemNaslovu', () => {
  test('naslov iz uvoza opozori, da pošte ne more prejeti', () => {
    const o = opozoriloOGenericnemNaslovu('ime.priimek.a1b2c3d4@balinar.app')
    expect(o).toMatch(/ne more prejeti pošte/i)
    expect(o).toMatch(/skrbnika/i)
  })

  test('presledki okoli naslova ne zmotijo prepoznave', () => {
    expect(opozoriloOGenericnemNaslovu('  nekdo@balinar.app  ')).not.toBeNull()
  })

  test('pravi naslov ne opozarja', () => {
    expect(opozoriloOGenericnemNaslovu('vehovecs@gmail.com')).toBeNull()
    expect(opozoriloOGenericnemNaslovu('')).toBeNull()
  })

  test('podobna, a tuja domena ne velja za generično', () => {
    expect(opozoriloOGenericnemNaslovu('nekdo@balinar.app.zlonamerno.si')).toBeNull()
  })
})

describe('SPOROCILO_POSLANO', () => {
  test('ne razkrije, ali račun obstaja', () => {
    expect(SPOROCILO_POSLANO).toMatch(/če za ta naslov obstaja račun/i)
  })
})
