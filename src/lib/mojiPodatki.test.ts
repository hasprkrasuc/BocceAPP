import { describe, it, expect } from 'vitest'
import { sestaviIzvoz, imeDatoteke, preimenujPolja } from './mojiPodatki'

const CAS = new Date('2026-08-09T12:34:56.000Z')

describe('preimenujPolja', () => {
  it('preimenuje stolpce v slovenska imena', () => {
    expect(preimenujPolja({ full_name: 'Ana Novak', emso: '0101990500123' }))
      .toEqual({ ime_in_priimek: 'Ana Novak', emso: '0101990500123' })
  })

  it('prazna polja OBDRŽI kot null — odsotnost podatka je tudi informacija', () => {
    expect(preimenujPolja({ phone: null, address_street: undefined }))
      .toEqual({ telefon: null, naslov_ulica: null })
  })

  it('tehnična polja izpusti — niso osebni podatek', () => {
    expect(preimenujPolja({ full_name: 'Ana', must_change_password: false }))
      .toEqual({ ime_in_priimek: 'Ana' })
  })

  it('neznanega stolpca ne izgubi, le ne preimenuje ga', () => {
    expect(preimenujPolja({ nekaj_novega: 42 })).toEqual({ nekaj_novega: 42 })
  })
})

describe('sestaviIzvoz', () => {
  const podatki = {
    profil: { full_name: 'Ana Novak', emso: '0101990500123', phone: null },
    ekipe: [{ club_name: 'BK Postojna' }],
  }

  it('vrne veljaven JSON s pojasnilom in časom', () => {
    const o = JSON.parse(sestaviIzvoz(podatki, CAS))
    expect(o._o_izvozu.ustvarjeno).toBe('2026-08-09T12:34:56.000Z')
    expect(o._o_izvozu.pojasnilo).toContain('null')
  })

  it('vsebuje občutljive podatke — vpogled mora pokazati vse, kar hranimo', () => {
    const o = JSON.parse(sestaviIzvoz(podatki, CAS))
    expect(o.profil.emso).toBe('0101990500123')
    expect(o.profil.ime_in_priimek).toBe('Ana Novak')
    expect(o.profil.telefon).toBeNull()
  })

  it('manjkajoče skupine so prazni seznami, ne izpuščene', () => {
    const o = JSON.parse(sestaviIzvoz({ profil: {} }, CAS))
    expect(o.ekipe).toEqual([])
    expect(o.sodniske_tekme).toEqual([])
    expect(o.prijave_na_turnirje).toEqual([])
  })

  it('je berljivo oblikovan (zamiki), ne stisnjen v eno vrstico', () => {
    expect(sestaviIzvoz(podatki, CAS).split('\n').length).toBeGreaterThan(5)
  })
})

describe('imeDatoteke', () => {
  it('vsebuje ime osebe in datum', () => {
    expect(imeDatoteke('Ana Novak', CAS)).toBe('balinarapp-ana-novak-2026-08-09.json')
  })

  it('odstrani šumnike in presledke', () => {
    expect(imeDatoteke('Gašper Krašévec', CAS)).toBe('balinarapp-gasper-krasevec-2026-08-09.json')
  })

  it('brez imena da smiselno privzeto', () => {
    expect(imeDatoteke(null, CAS)).toBe('balinarapp-moji-podatki-2026-08-09.json')
    expect(imeDatoteke('!!!', CAS)).toBe('balinarapp-moji-podatki-2026-08-09.json')
  })
})
