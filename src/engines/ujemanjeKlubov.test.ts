import { describe, test, expect } from 'vitest'
import {
  normalizirajImeKluba, strniImeKluba, besedeImena, najdiKlub, predlagajPovezave,
  type KlubZaUjemanje,
} from './ujemanjeKlubov'

const k = (id: string, name: string): KlubZaUjemanje => ({ id, name })

// Oblike imen so povzete po resničnih razhajanjih med league_teams.club_name in
// clubs.name, imena klubov pa so nadomeščena s testnimi.
const KLUBI: KlubZaUjemanje[] = [
  k('c1', 'BŠK ZZ Dobrava'),
  k('c2', 'ZZ Kozlek Testni'),
  k('c3', 'Balinarski športni klub ZZ Polje'),
  k('c4', 'ZZTEAM ZZ Idrija'),
  k('c5', 'ZZ Šiška'),
  k('c6', 'ZZ Center Kranj'),
  k('c7', 'ZZ Center Koper'),
]

describe('normalizirajImeKluba', () => {
  test('male črke, šumniki na osnovne, ločila v presledek', () => {
    expect(normalizirajImeKluba('BŠK  Dobrova-Polje!')).toBe('bsk dobrova polje')
    expect(normalizirajImeKluba('Žužemberk Črnuče Šiška')).toBe('zuzemberk crnuce siska')
  })

  test('prazno in null data prazen niz', () => {
    expect(normalizirajImeKluba(null)).toBe('')
    expect(normalizirajImeKluba('   ')).toBe('')
  })
})

describe('strniImeKluba in besedeImena', () => {
  test('strnjeno ime nima presledkov', () => {
    expect(strniImeKluba('Brus Team Idrija')).toBe('brusteamidrija')
    expect(strniImeKluba('BRUSTEAM IDRIJA')).toBe('brusteamidrija')
  })

  test('besede so urejene in brez ponovitev', () => {
    expect(besedeImena('ZZ Kozlek ZZ')).toEqual(['kozlek', 'zz'])
  })
})

describe('najdiKlub', () => {
  test('točno ujemanje po normalizaciji', () => {
    const u = najdiKlub('bšk zz dobrava', KLUBI)
    expect(u.klub?.id).toBe('c1')
    expect(u.zanesljivost).toBe('tocno')
  })

  test('razmik med besedami ne šteje', () => {
    const u = najdiKlub('ZZ Team ZZ Idrija', KLUBI)
    expect(u.klub?.id).toBe('c4')
    expect(u.zanesljivost).toBe('strnjeno')
  })

  test('obrnjen vrstni red besed se ujame kot nabor', () => {
    const u = najdiKlub('Testni Kozlek ZZ', KLUBI)
    expect(u.klub?.id).toBe('c2')
    expect(u.zanesljivost).toBe('nabor')
  })

  test('krajše ime prijave se ujame z daljšim uradnim imenom kluba', () => {
    const u = najdiKlub('ZZ Polje', KLUBI)
    expect(u.klub?.id).toBe('c3')
    expect(u.zanesljivost).toBe('delno')
  })

  test('daljše ime prijave se ujame s krajšim imenom kluba', () => {
    // »Šiška Ljubljana« v prijavi, klub pa je zapisan samo »ZZ Šiška«.
    const u = najdiKlub('ZZ Šiška Ljubljana', KLUBI)
    expect(u.klub?.id).toBe('c5')
    expect(u.zanesljivost).toBe('delno')
  })

  test('dvoumnosti ne razreši sam — vrne kandidate brez izbire', () => {
    const u = najdiKlub('ZZ Center', KLUBI)
    expect(u.klub).toBeNull()
    expect(u.zanesljivost).toBe('delno')
    expect(u.kandidati.map(x => x.id).sort()).toEqual(['c6', 'c7'])
  })

  test('ime iz samih splošnih besed se ne ujame z ničimer', () => {
    // Brez te straže bi se »Balinarski športni klub« ujel z vsakim, ki te besede vsebuje.
    expect(najdiKlub('Balinarski športni klub', KLUBI).klub).toBeNull()
    expect(najdiKlub('BK', KLUBI).kandidati).toEqual([])
  })

  test('ekipa območne zveze se ne ujame s klubom istega kraja', () => {
    // »OBZ POSTOJNA« je ekipa območne zveze in kluba nima; brez straže bi se po
    // besedi »Postojna« ujela s klubom in nosila tuj grb.
    const zKrajem = [...KLUBI, k('c8', 'ZZ Postojna')]
    expect(najdiKlub('ZZ Postojna', zKrajem).klub?.id).toBe('c8')
    const u = najdiKlub('OBZ ZZ Postojna', zKrajem)
    expect(u.klub).toBeNull()
    expect(u.kandidati).toEqual([])
  })

  test('skupna ekipa dveh društev se ne pripiše nobenemu od njiju', () => {
    // »SKALA PLISKOVICA« je skupna ekipa Skale Sežane in Pliskovice. Beseda
    // »skala« vodi drug klub, zato prijava ni Pliskovica sama.
    const dve = [k('p', 'Pliskovica ZZ'), k('s', 'Skala ZZ Sežana')]
    expect(najdiKlub('Pliskovica ZZ', dve).klub?.id).toBe('p')
    const u = najdiKlub('Skala Pliskovica ZZ', dve)
    expect(u.klub).toBeNull()
    expect(u.zanesljivost).toBeNull()
  })

  test('kraj v imenu drugega kluba ne prepreči ujemanja', () => {
    // »Šiška Ljubljana« se mora ujeti s »Šiška ZZ«, čeprav »ljubljana« nastopa
    // v imenu drugega kluba — tam je pristavek za krajem, ne vodilna beseda.
    const zLjubljano = [k('si', 'Šiška ZZ'), k('kr', 'Balinarski klub Krim ZZ Ljubljana')]
    expect(najdiKlub('Šiška ZZ Ljubljana', zLjubljano).klub?.id).toBe('si')
  })

  test('neznano ime nima predloga', () => {
    const u = najdiKlub('ZZ Nekaj Desetega', KLUBI)
    expect(u.klub).toBeNull()
    expect(u.zanesljivost).toBeNull()
  })

  test('prazno ime ekipe ne vrne ničesar', () => {
    expect(najdiKlub('', KLUBI).klub).toBeNull()
    expect(najdiKlub(null, KLUBI).klub).toBeNull()
  })

  test('močnejša stopnja z več kandidati ne pade na šibkejšo', () => {
    // Dva kluba z istim normaliziranim imenom: odločitev je človekova, ne motorjeva.
    const dvojnik = [k('a', 'ZZ Enako Ime'), k('b', 'zz enako ime'), k('c', 'ZZ Enako Ime Drugi')]
    const u = najdiKlub('ZZ Enako Ime', dvojnik)
    expect(u.klub).toBeNull()
    expect(u.zanesljivost).toBe('tocno')
    expect(u.kandidati.map(x => x.id)).toEqual(['a', 'b'])
  })
})

describe('predlagajPovezave', () => {
  const ekipe = [
    { id: 't1', club_name: 'ZZ Polje', club_id: null },
    { id: 't2', club_name: 'ZZ Center', club_id: null },          // dvoumno
    { id: 't3', club_name: 'ZZ Nekaj Desetega', club_id: null },  // brez zadetka
    { id: 't4', club_name: 'ZZ Šiška', club_id: 'c1' },           // že povezana
  ]

  test('predlaga le nedvoumne zadetke za ekipe brez kluba', () => {
    const p = predlagajPovezave(ekipe, KLUBI)
    expect(p.map(x => x.ekipaId)).toEqual(['t1'])
    expect(p[0].klub.id).toBe('c3')
    expect(p[0].zanesljivost).toBe('delno')
  })

  test('obstoječe povezave pusti pri miru, tudi kadar bi predlagal drugače', () => {
    // t4 bi se ujela s c5, a ima že c1 — ugibanje obstoječega podatka ne povozi.
    const p = predlagajPovezave(ekipe, KLUBI)
    expect(p.some(x => x.ekipaId === 't4')).toBe(false)
  })

  test('brez klubov ni predlogov', () => {
    expect(predlagajPovezave(ekipe, [])).toEqual([])
  })
})
