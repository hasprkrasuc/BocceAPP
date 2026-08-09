import { describe, it, expect } from 'vitest'
import { zamenjaniDomacini, opozoriloOZamenjavah } from './rocneZamenjave'

const t = (round_number: number, home_team_id: string, away_team_id: string) =>
  ({ round_number, home_team_id, away_team_id })

// Izsek 2. lige vzhod 2026/27, skupina A: v 5. in 10. kolu je domačin
// med Budničarjem in Hočami ročno zamenjan.
const NOVE = [
  t(5, 'BREZA', 'SISKA'), t(5, 'BUDNICAR', 'HOCE'), t(5, 'TABOR', 'ROGOVILA'),
  t(10, 'SISKA', 'BREZA'), t(10, 'HOCE', 'BUDNICAR'), t(10, 'ROGOVILA', 'TABOR'),
]
const OBSTOJECE = [
  t(5, 'BREZA', 'SISKA'), t(5, 'HOCE', 'BUDNICAR'), t(5, 'TABOR', 'ROGOVILA'),
  t(10, 'SISKA', 'BREZA'), t(10, 'BUDNICAR', 'HOCE'), t(10, 'ROGOVILA', 'TABOR'),
]

describe('zamenjaniDomacini', () => {
  it('najde obe zamenjavi in ju pripiše pravima koloma', () => {
    expect(zamenjaniDomacini(OBSTOJECE, NOVE)).toEqual([5, 10])
  })

  it('enak razpored nima zamenjav', () => {
    expect(zamenjaniDomacini(NOVE, NOVE)).toEqual([])
  })

  it('drug par v istem kolu ni zamenjava, ampak drug žreb', () => {
    const drugace = [t(5, 'BREZA', 'HOCE'), t(5, 'BUDNICAR', 'SISKA')]
    expect(zamenjaniDomacini(drugace, NOVE)).toEqual([])
  })

  it('isti par v drugem kolu ni zamenjava', () => {
    expect(zamenjaniDomacini([t(7, 'HOCE', 'BUDNICAR')], NOVE)).toEqual([])
  })

  it('prazna vhoda', () => {
    expect(zamenjaniDomacini([], NOVE)).toEqual([])
    expect(zamenjaniDomacini(OBSTOJECE, [])).toEqual([])
  })

  it('šteje vsako zamenjano tekmo posebej, tudi če sta v istem kolu', () => {
    const nove = [t(3, 'A', 'B'), t(3, 'C', 'D')]
    const obst = [t(3, 'B', 'A'), t(3, 'D', 'C')]
    expect(zamenjaniDomacini(obst, nove)).toEqual([3, 3])
  })
})

describe('opozoriloOZamenjavah', () => {
  it('brez zamenjav ni opozorila', () => {
    expect(opozoriloOZamenjavah(NOVE, NOVE)).toBe('')
  })

  it('našteje kola, vsako enkrat', () => {
    const o = opozoriloOZamenjavah(OBSTOJECE, NOVE)
    expect(o).toContain('2 tekmah')
    expect(o).toContain('5. kolo')
    expect(o).toContain('10. kolo')
    expect(o).toContain('Regeneracija jih povozi')
  })

  it('ednina pri eni tekmi', () => {
    const o = opozoriloOZamenjavah([t(5, 'HOCE', 'BUDNICAR')], NOVE)
    expect(o).toContain('1 tekmi')
  })
})
