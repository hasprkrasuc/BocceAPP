import { describe, test, expect } from 'vitest'
import { parseEvidenceRows, jeEvidencniIzvoz, ostanekMaske } from './parseEvidenceXlsx'
import { parseImportRows } from './parseImportFile'

// Vsi podatki so izmišljeni. Pravega izvoza iz evidence v repozitorij ne dajemo:
// vsebuje imena in delne EMŠO resničnih oseb, repozitorij pa je javen.

const GLAVA = ['Priimek', 'Ime', 'Klub', 'Društvo', 'OBZ', 'Tekmovanje', 'Spol', 'Datum rojstva', 'EMŠO', 'Športna št.']

const evidenca: unknown[][] = [
  GLAVA,
  ['TESTNI', 'PETER', 'ZZ TEST KLUB', 'B. društvo ZZ Test', 'OBZ Test', 'Super Liga', 'M', '******1959', '*********0189', ''],
  ['PRIMEROVA', 'ANA', 'ZZ TEST KLUB', 'B. društvo ZZ Test', 'OBZ Test', 'Super Liga', 'Ž', '****1976', '*********0026', '4711'],
  ['NEZAKRITI', 'MATIJA', 'ZZ TEST KLUB', 'B. društvo ZZ Test', 'OBZ Test', 'Super Liga', 'M', '20.6.2010', '2006010500031', ''],
]

// Registracijski obrazec BZS — mora ostati prepoznan kot svoja oblika.
const obrazec: unknown[][] = [
  ['EVIDENCA IN REGISTRACIJA IGRALCEV PO KLUBIH ZA SEZONO 2025/26'],
  ['Balinarski klub:', '', 'BK PRIMER'],
  [],
  ['Klub', 'Ime', '', 'Priimek', 'Športna št.', 'Spol', 'Datum', 'EMŠO', 'Kraj ', 'Država', 'Državljanstvo', 'Ulica', 'Hišna', 'Poštna', 'Kraj '],
  ['BK PRIMER', 'PETER', '', 'TESTNI', '', 'M', '1.1.1990', '0101990500011', 'LJUBLJANA', 'SLO', 'SLO', 'TESTNA ULICA', 6, 1000, 'MARIBOR'],
]

describe('ostanekMaske', () => {
  test('vrne zadnje števke zakrite vrednosti', () => {
    expect(ostanekMaske('*********0189')).toBe('0189')
    expect(ostanekMaske('****1976')).toBe('1976')
    expect(ostanekMaske('*********')).toBe('')
  })
})

describe('jeEvidencniIzvoz', () => {
  test('prepozna ravno tabelo iz evidence', () => {
    expect(jeEvidencniIzvoz(evidenca)).toBe(true)
  })

  test('registracijskega obrazca NE razglasi za evidenco', () => {
    expect(jeEvidencniIzvoz(obrazec)).toBe(false)
  })

  test('tabela s Priimek/Ime/EMŠO, a brez Društvo/OBZ/Tekmovanje, ni evidenca', () => {
    expect(jeEvidencniIzvoz([['Priimek', 'Ime', 'EMŠO', 'Klub']])).toBe(false)
  })
})

describe('parseEvidenceRows', () => {
  const result = parseEvidenceRows(evidenca)

  test('prebere vse igralce in klub iz vrstic', () => {
    expect(result.players).toHaveLength(3)
    expect(result.club.name).toBe('ZZ TEST KLUB')
    expect(result.clubs).toEqual(['ZZ TEST KLUB'])
    expect(result.format).toBe('evidenca')
  })

  test('sestavi ime v vrstnem redu IME PRIIMEK, čeprav je v datoteki priimek prvi', () => {
    // Obstoječi zapisi v bazi so nastali iz registracijskega obrazca v tem vrstnem
    // redu; obrnjen vrstni red bi pomenil, da se ne ujame noben igralec.
    expect(result.players[0].fullName).toBe('PETER TESTNI')
    expect(result.players[1].fullName).toBe('ANA PRIMEROVA')
  })

  test('zamaskiran datum da samo letnico, ne datuma', () => {
    expect(result.players[0].birthDate).toBeNull()
    expect(result.players[0].birthYear).toBe(1959)
    // krajša maska ("****1976") da isto letnico
    expect(result.players[1].birthYear).toBe(1976)
  })

  test('zamaskiran EMŠO nikoli ne postane EMŠO', () => {
    expect(result.players[0].emso).toBeNull()
    expect(result.players[0].emsoSuffix).toBe('0189')
    expect(result.players[1].emsoSuffix).toBe('0026')
  })

  test('neokrnjen zapis se prebere po ustaljeni poti', () => {
    const matija = result.players[2]
    expect(matija.emso).toBe('2006010500031')
    expect(matija.emsoSuffix).toBeNull()
    expect(matija.birthDate).toBe('2010-06-20')
    expect(matija.birthYear).toBe(2010)
  })

  test('prebere spol, športno številko in klub vrstice', () => {
    expect(result.players[0].gender).toBe('M')
    expect(result.players[1].gender).toBe('Ž')
    expect(result.players[1].sportNumber).toBe('4711')
    expect(result.players[0].sportNumber).toBeNull()
    expect(result.players[0].sourceClub).toBe('ZZ TEST KLUB')
  })

  test('opozori, da je izvoz zamaskiran in brez športnih številk', () => {
    const brezStevilk = parseEvidenceRows([GLAVA, evidenca[1]])
    expect(brezStevilk.warnings.join(' ')).toMatch(/zamaskiran/i)
  })

  test('več klubov v datoteki: našteje jih in opozori, club.name pa pusti prazen', () => {
    const vec = parseEvidenceRows([
      GLAVA,
      evidenca[1],
      ['DRUGI', 'JOŽE', 'ZZ TEST DRUGI', 'B. društvo ZZ Drugi', 'OBZ Test', 'Super Liga', 'M', '******1980', '*********0001', ''],
    ])
    expect(vec.clubs).toEqual(['ZZ TEST KLUB', 'ZZ TEST DRUGI'])
    expect(vec.club.name).toBe('')
    expect(vec.warnings.join(' ')).toMatch(/2 klubov/)
  })

  test('vrstica brez priimka se izpusti z opozorilom', () => {
    const zLuknjo = parseEvidenceRows([
      GLAVA,
      ['', 'BREZPRIIMKA', 'ZZ TEST KLUB', '', 'OBZ Test', 'Super Liga', 'M', '******1990', '*********0002', ''],
    ])
    expect(zLuknjo.players).toHaveLength(0)
    expect(zLuknjo.warnings.join(' ')).toMatch(/manjka priimek/i)
  })

  test('napaka, če glave tabele sploh ni', () => {
    expect(() => parseEvidenceRows([['nekaj', 'drugega']])).toThrow(/ni najdena tabela/i)
  })
})

describe('parseEvidenceRows — novejši izvoz z e-naslovom', () => {
  // Izvoz iz evidence odslej lahko nosi s sabo e-naslov iz aplikacije in vrstice,
  // ki niso zamaskirane. Oboje se mora prebrati.
  const GLAVA2 = [...GLAVA, 'e-mail balinar.app']
  const novi: unknown[][] = [
    GLAVA2,
    ['TESTNI', 'PETER', 'ZZ TEST KLUB', 'B. društvo ZZ Test', 'OBZ Test', '1. Liga', 'm',
     '1980-07-25', '2507980500599', '', 'ZZ.Testni.7fcf@balinar.app'],
    ['ZAKRITI', 'ANA', 'ZZ TEST KLUB', 'B. društvo ZZ Test', 'OBZ Test', '1. Liga', 'ž',
     '******1957', '*********0429', '', ''],
  ]
  const r = parseEvidenceRows(novi)

  test('prebere e-naslov in ga zapiše z malimi črkami', () => {
    expect(r.players[0].email).toBe('zz.testni.7fcf@balinar.app')
  })

  test('prazen e-naslov je null, ne prazen niz', () => {
    expect(r.players[1].email).toBeNull()
  })

  test('mali "m" in "ž" se prepoznata kot spol', () => {
    expect(r.players[0].gender).toBe('M')
    expect(r.players[1].gender).toBe('Ž')
  })

  test('neokrnjena vrstica da poln datum in EMŠO, zakrita pa letnico in ostanek', () => {
    expect(r.players[0].birthDate).toBe('1980-07-25')
    expect(r.players[0].emso).toBe('2507980500599')
    expect(r.players[1].birthDate).toBeNull()
    expect(r.players[1].birthYear).toBe(1957)
    expect(r.players[1].emsoSuffix).toBe('0429')
  })

  test('tekmovanje se zabeleži za presojo o odjavi članov', () => {
    expect(r.competitions).toEqual(['1. Liga'])
  })
})

describe('parseImportRows — razvrščanje po obliki', () => {
  test('izvoz iz evidence gre v svoj razčlenjevalnik', () => {
    const r = parseImportRows(evidenca)
    expect(r.format).toBe('evidenca')
    expect(r.players).toHaveLength(3)
  })

  test('registracijski obrazec gre po ustaljeni poti', () => {
    const r = parseImportRows(obrazec)
    expect(r.format).toBe('bzs')
    expect(r.club.name).toBe('BK PRIMER')
    expect(r.players[0].fullName).toBe('PETER TESTNI')
    // pri neokrnjenem viru je letnica izpeljana iz datuma
    expect(r.players[0].birthYear).toBe(1990)
    expect(r.players[0].emsoSuffix).toBeNull()
    expect(r.players[0].sourceClub).toBeNull()
  })
})
