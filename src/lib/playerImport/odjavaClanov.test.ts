import { describe, test, expect } from 'vitest'
import { kandidatiZaOdjavo, opozoriloOObsegu, type ClanKluba } from './odjavaClanov'

const c = (id: string, ime: string): ClanKluba => ({ id, full_name: ime, birth_year: null })

const CLANI = [c('u1', 'Ana Kos'), c('u2', 'Bine Novak'), c('u3', 'Cene Kralj'), c('u4', 'Dani Mlakar')]

describe('kandidatiZaOdjavo', () => {
  test('kdor je v datoteki, ni kandidat', () => {
    const { kandidati } = kandidatiZaOdjavo(CLANI, new Set(['u1', 'u2']), new Set())
    expect(kandidati.map(k => k.id)).toEqual(['u3', 'u4'])
  })

  test('kdor ima ekipo v tej sezoni, se zadrži in ni za odjavo', () => {
    // Očitno je še aktiven — npr. mladinec, ki nastopa za drug klub, ali ročno dodan igralec.
    const { kandidati, zadrzani } = kandidatiZaOdjavo(CLANI, new Set(['u1']), new Set(['u3']))
    expect(kandidati.map(k => k.id)).toEqual(['u2', 'u4'])
    expect(zadrzani.map(k => k.id)).toEqual(['u3'])
  })

  test('prazna datoteka ne pomeni, da so vsi za odjavo, če imajo ekipe', () => {
    const { kandidati, zadrzani } = kandidatiZaOdjavo(CLANI, new Set(), new Set(['u1', 'u2', 'u3', 'u4']))
    expect(kandidati).toHaveLength(0)
    expect(zadrzani).toHaveLength(4)
  })

  test('brez članov ni kandidatov', () => {
    const { kandidati, zadrzani } = kandidatiZaOdjavo([], new Set(['u1']), new Set())
    expect(kandidati).toHaveLength(0)
    expect(zadrzani).toHaveLength(0)
  })
})

describe('opozoriloOObsegu', () => {
  test('registracijski obrazec je seznam vseh članov — brez opozorila', () => {
    expect(opozoriloOObsegu(undefined, 'bzs')).toBeNull()
    expect(opozoriloOObsegu(['Super Liga'], 'bzs')).toBeNull()
  })

  test('izvoz z enim samim tekmovanjem odsvetuje odjavo', () => {
    const o = opozoriloOObsegu(['Super Liga'], 'evidenca')
    expect(o).toMatch(/samo tekmovanje/i)
    expect(o).toMatch(/Super Liga/)
    expect(o).toMatch(/ni več registriran/i)
  })

  test('izvoz z več tekmovanji našteje tekmovanja in svetuje preverbo', () => {
    const o = opozoriloOObsegu(['Super Liga', '1. liga'], 'evidenca')
    expect(o).toMatch(/Super Liga, 1\. liga/)
    expect(o).toMatch(/preveri/i)
  })

  test('izvoz brez stolpca tekmovanje ne opozarja', () => {
    expect(opozoriloOObsegu([], 'evidenca')).toBeNull()
  })
})
