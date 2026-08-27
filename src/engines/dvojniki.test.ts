import { describe, test, expect } from 'vitest'
import { poisciDvojnike, presodiPar, zetoni, jePrazenZapis, type ZapisZaPrimerjavo } from './dvojniki'

function z(over: Partial<ZapisZaPrimerjavo> & { id: string; full_name: string }): ZapisZaPrimerjavo {
  return { emso: null, date_of_birth: null, license_number: null, birth_year: null, club: null, ...over }
}

describe('žetoni imena', () => {
  test('odstrani diakritiko in ločila, ne glede na velikost črk', () => {
    expect(zetoni('TOMAŽ TOMAŽIČ')).toEqual(['tomaz', 'tomazic'])
    expect(zetoni('Tomaž Tomažič')).toEqual(['tomaz', 'tomazic'])
  })

  test('velike črke s strešico se prevedejo enako kot male', () => {
    // Past, na katero sem naletel ob pripravi: če se diakritika odstrani pred
    // pretvorbo v male črke, »TOMAŽ TOMAŽIČ« postane »toma toma i« in je videti
    // kot podmnožica »TOMAŽ KRISTANČIČ« (»toma krista i«).
    expect(zetoni('TOMAŽ TOMAŽIČ')).toEqual(zetoni('tomaž tomažič'))
    expect(zetoni('TOMAŽ TOMAŽIČ')).not.toContain('toma')
  })

  test('pika in dvojne presledke odstrani', () => {
    expect(zetoni('JANEZ ml. BRUS')).toEqual(['janez', 'ml', 'brus'])
  })

  test('podvojene besede odpadejo', () => {
    expect(zetoni('Ana Ana Novak')).toEqual(['ana', 'novak'])
  })

  test('prazno ime da prazen seznam', () => {
    expect(zetoni(null)).toEqual([])
    expect(zetoni('   ')).toEqual([])
  })
})

describe('prazen zapis', () => {
  test('brez EMŠO, datuma in licence', () => {
    expect(jePrazenZapis(z({ id: 'a', full_name: 'ZZ Test' }))).toBe(true)
  })

  test('katerakoli od treh vrednosti ga napolni', () => {
    expect(jePrazenZapis(z({ id: 'a', full_name: 'x', emso: '1' }))).toBe(false)
    expect(jePrazenZapis(z({ id: 'a', full_name: 'x', date_of_birth: '1980-01-01' }))).toBe(false)
    expect(jePrazenZapis(z({ id: 'a', full_name: 'x', license_number: '123' }))).toBe(false)
  })

  test('prazen niz ne šteje za vrednost', () => {
    expect(jePrazenZapis(z({ id: 'a', full_name: 'x', license_number: '' }))).toBe(true)
  })
})

describe('presoja para', () => {
  test('dva svoja EMŠO govorita proti združitvi', () => {
    const p = presodiPar(
      z({ id: 'a', full_name: 'Ivan Ličan', emso: '0101964500001', birth_year: 1964 }),
      z({ id: 'b', full_name: 'IVAN LIČAN', emso: '0101961500002', birth_year: 1961 }),
      'isti_nabor',
    )
    expect(p.zanesljivost).toBe('malo_verjeten')
    expect(p.proti.join(' ')).toContain('EMŠO')
  })

  test('prazna stran ob polni je verjeten dvojnik', () => {
    const p = presodiPar(
      z({ id: 'a', full_name: 'Jože Zadnik', emso: '1505959500573', birth_year: 1959 }),
      z({ id: 'b', full_name: 'Jože Zadnik' }),
      'isti_nabor',
    )
    expect(p.zanesljivost).toBe('verjeten')
    expect(p.za.join(' ')).toContain('brez EMŠO')
  })

  test('dva prazna zapisa sta le mozen dvojnik — nič ne govori ne za ne proti', () => {
    const p = presodiPar(
      z({ id: 'a', full_name: 'Ana Novak' }),
      z({ id: 'b', full_name: 'ANA NOVAK' }),
      'isti_nabor',
    )
    expect(p.zanesljivost).toBe('mozen')
  })

  test('različna letnica govori proti, tudi brez EMŠO', () => {
    const p = presodiPar(
      z({ id: 'a', full_name: 'Anton Anže Trobec', birth_year: 2010 }),
      z({ id: 'b', full_name: 'Anton Trobec', birth_year: 1977 }),
      'podmnozica',
    )
    expect(p.zanesljivost).toBe('malo_verjeten')
    expect(p.proti.join(' ')).toContain('letnica')
  })

  test('ista letnica šteje za združitev', () => {
    const p = presodiPar(
      z({ id: 'a', full_name: 'Ana Novak', birth_year: 1980, emso: '0101980500001' }),
      z({ id: 'b', full_name: 'Ana Novak', birth_year: 1980 }),
      'isti_nabor',
    )
    expect(p.za.join(' ')).toContain('ista letnica')
  })

  test('EMŠO samo na eni strani ne govori proti — to je običajno stanje', () => {
    const p = presodiPar(
      z({ id: 'a', full_name: 'Ana Novak', emso: '0101980500001' }),
      z({ id: 'b', full_name: 'Ana Novak', license_number: '55' }),
      'isti_nabor',
    )
    expect(p.proti).toHaveLength(0)
  })
})

describe('iskanje po seznamu', () => {
  test('primer Brus: podmnožica z eno prazno stranjo', () => {
    const pari = poisciDvojnike([
      z({ id: 'star', full_name: 'Janez Brus' }),
      z({ id: 'nov', full_name: 'JANEZ ml. BRUS', emso: '1912969500518', birth_year: 1969, license_number: '3356' }),
    ])
    expect(pari).toHaveLength(1)
    expect(pari[0].zanesljivost).toBe('verjeten')
    expect(pari[0].ujemanje).toBe('podmnozica')
    // Polni zapis mora biti prvi — predlog je vedno »obdrži polnega«.
    expect(pari[0].a.id).toBe('nov')
    expect(pari[0].b.id).toBe('star')
  })

  test('enobesedna imena se ne ujemajo z ničimer', () => {
    expect(poisciDvojnike([
      z({ id: 'a', full_name: 'Skala' }),
      z({ id: 'b', full_name: 'Skala Hrast' }),
    ])).toHaveLength(0)
  })

  test('vsak par se poroča enkrat', () => {
    const pari = poisciDvojnike([
      z({ id: 'a', full_name: 'Ana Novak' }),
      z({ id: 'b', full_name: 'ANA NOVAK' }),
      z({ id: 'c', full_name: 'Ana Novak' }),
    ])
    expect(pari).toHaveLength(3)   // a-b, a-c, b-c
    const kljuci = pari.map(p => [p.a.id, p.b.id].sort().join('-'))
    expect(new Set(kljuci).size).toBe(3)
  })

  test('različna imena se ne ujemajo', () => {
    expect(poisciDvojnike([
      z({ id: 'a', full_name: 'TOMAŽ TOMAŽIČ' }),
      z({ id: 'b', full_name: 'TOMAŽ KRISTANČIČ' }),
    ])).toHaveLength(0)
  })

  test('verjetni pari so na vrhu', () => {
    const pari = poisciDvojnike([
      z({ id: 'l1', full_name: 'Ivan Ličan', emso: '0101964500001', birth_year: 1964 }),
      z({ id: 'l2', full_name: 'IVAN LIČAN', emso: '0101961500002', birth_year: 1961 }),
      z({ id: 'z1', full_name: 'Jože Zadnik', emso: '1505959500573', birth_year: 1959 }),
      z({ id: 'z2', full_name: 'Jože Zadnik' }),
    ])
    expect(pari).toHaveLength(2)
    expect(pari[0].zanesljivost).toBe('verjeten')
    expect(pari[0].a.full_name).toBe('Jože Zadnik')
    expect(pari[1].zanesljivost).toBe('malo_verjeten')
  })

  test('števke v imenu ločijo zapise in se ne pobrišejo', () => {
    // Prva različica motorja je števke brisala skupaj z ločili, zato sta se
    // »Ime1 Priimek1« in »Ime2 Priimek2« skrčila na isti par besed. Pri 2000
    // zapisih je to dalo 1.999.000 lažnih parov — ujel je ta test.
    expect(zetoni('Ime1 Priimek1')).toEqual(['ime1', 'priimek1'])
    expect(poisciDvojnike([
      z({ id: 'a', full_name: 'Ime1 Priimek1' }),
      z({ id: 'b', full_name: 'Ime2 Priimek2' }),
    ])).toHaveLength(0)
  })

  test('velik seznam brez dvojnikov ne vrne ničesar in se ne zaduši', () => {
    const veliko = Array.from({ length: 2000 }, (_, i) =>
      z({ id: `i${i}`, full_name: `Ime${i} Priimek${i}` }))
    expect(poisciDvojnike(veliko)).toHaveLength(0)
  })

  test('pogosto ime ne potegne v par vseh, ki ga nosijo', () => {
    const pari = poisciDvojnike([
      z({ id: 'a', full_name: 'Ivan Novak' }),
      z({ id: 'b', full_name: 'Ivan Kovač' }),
      z({ id: 'c', full_name: 'Ivan Horvat' }),
    ])
    expect(pari).toHaveLength(0)
  })
})
