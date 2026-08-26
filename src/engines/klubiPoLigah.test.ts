import { describe, test, expect } from 'vitest'
import { razdelekZaSezono, razvrstiKlube, razdelkiKlubov } from './klubiPoLigah'

const k = (id: string) => ({ id })

describe('razdelekZaSezono', () => {
  test('moške članske lige po rangu', () => {
    expect(razdelekZaSezono('super_liga', 'men')).toBe('super_liga')
    expect(razdelekZaSezono('1_liga', 'men')).toBe('1_liga')
    expect(razdelekZaSezono('2_liga_vzhod', 'men')).toBe('2_liga_vzhod')
    expect(razdelekZaSezono('2_liga_zahod', 'men')).toBe('2_liga_zahod')
  })

  test('ženska 1. liga je svoj razdelek, ne moška', () => {
    // Obe sta v bazi zapisani kot tier '1_liga'; loči ju kategorija.
    expect(razdelekZaSezono('1_liga', 'women')).toBe('1_liga_clanice')
  })

  test('mladinski ligi sta tudi 1_liga, a pripadata svojima razdelkoma', () => {
    // Brez tega bi ekipe U14 in U18 pristale med člani 1. lige.
    expect(razdelekZaSezono('1_liga', 'u14')).toBe('u14')
    expect(razdelekZaSezono('1_liga', 'u18')).toBe('u18')
  })

  test('kategorija prevlada nad rangom tudi pri območnih ligah', () => {
    expect(razdelekZaSezono('obz', 'u18')).toBe('u18')
    expect(razdelekZaSezono('obz', 'men')).toBe('obz')
  })

  test('neznan rang ne pristane nikjer', () => {
    expect(razdelekZaSezono(null, 'men')).toBeNull()
    expect(razdelekZaSezono('nekaj_drugega', 'men')).toBeNull()
  })
})

describe('razdelkiKlubov', () => {
  test('klub brez ekipe v tekoči sezoni dobi "brez", ne "obz"', () => {
    // "obz" bi bila trditev, da igra območno ligo — tega ne vemo.
    const m = razdelkiKlubov([k('a')], [])
    expect([...m.get('a')!]).toEqual(['brez'])
  })

  test('klub z ekipama v dveh ligah je v obeh razdelkih', () => {
    const m = razdelkiKlubov([k('a')], [
      { club_id: 'a', tier: 'super_liga', category: 'men' },
      { club_id: 'a', tier: '1_liga', category: 'women' },
    ])
    expect([...m.get('a')!].sort()).toEqual(['1_liga_clanice', 'super_liga'])
  })

  test('dve ekipi v isti ligi ne podvojita razdelka', () => {
    const m = razdelkiKlubov([k('a')], [
      { club_id: 'a', tier: 'obz', category: 'men' },
      { club_id: 'a', tier: 'obz', category: 'men' },
    ])
    expect([...m.get('a')!]).toEqual(['obz'])
  })

  test('članstvo brez prepoznanega ranga ne šteje za nastop', () => {
    const m = razdelkiKlubov([k('a')], [{ club_id: 'a', tier: null, category: 'men' }])
    expect([...m.get('a')!]).toEqual(['brez'])
  })
})

describe('razvrstiKlube', () => {
  const klubi = [k('super'), k('prva'), k('oboje'), k('nihce')]
  const clanstva = [
    { club_id: 'super', tier: 'super_liga', category: 'men' },
    { club_id: 'prva', tier: '1_liga', category: 'men' },
    { club_id: 'oboje', tier: 'super_liga', category: 'men' },
    { club_id: 'oboje', tier: '1_liga', category: 'women' },
  ]

  test('razdelki so v ustaljenem vrstnem redu, prazni izpadejo', () => {
    expect(razvrstiKlube(klubi, clanstva).map(r => r.key))
      .toEqual(['super_liga', '1_liga', '1_liga_clanice', 'brez'])
  })

  test('klub z dvema ekipama se pojavi v obeh razdelkih', () => {
    const r = razvrstiKlube(klubi, clanstva)
    expect(r.find(x => x.key === 'super_liga')!.klubi.map(c => c.id)).toEqual(['super', 'oboje'])
    expect(r.find(x => x.key === '1_liga_clanice')!.klubi.map(c => c.id)).toEqual(['oboje'])
  })

  test('brez klubov ni razdelkov', () => {
    expect(razvrstiKlube([], clanstva)).toEqual([])
  })
})
