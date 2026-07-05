import { describe, test, expect } from 'vitest'
import { placementPoints, placementLabel } from './dpPlacement'

describe('placementPoints — DP točke po končni uvrstitvi', () => {
  test('1.=16, 2.=10, 3.=8, 4.=7', () => {
    expect(placementPoints(1)).toBe(16)
    expect(placementPoints(2)).toBe(10)
    expect(placementPoints(3)).toBe(8)
    expect(placementPoints(4)).toBe(7)
  })

  test('5.–8. = 3 (vsi štirje)', () => {
    expect([5, 6, 7, 8].map(placementPoints)).toEqual([3, 3, 3, 3])
  })

  test('9.–16. = 1 (vseh osem)', () => {
    expect([9, 12, 16].map(placementPoints)).toEqual([1, 1, 1])
  })

  test('17. in naprej = 0 (npr. dvojice imajo 20 ekip)', () => {
    expect(placementPoints(17)).toBe(0)
    expect(placementPoints(20)).toBe(0)
  })

  test('deljeni bron: dve ekipi z uvrstitvijo 3 → obe 8', () => {
    // ni tekme za 3. mesto → oba polfinalista imata final_rank=3
    expect(placementPoints(3)).toBe(8)
    // (točkovanje je čisto po rangu; deljeni bron uvozimo kot dva ranga 3)
  })

  test('neveljavne vrednosti → 0', () => {
    expect(placementPoints(0)).toBe(0)
    expect(placementPoints(-1)).toBe(0)
    expect(placementPoints(null as unknown as number)).toBe(0)
    expect(placementPoints(NaN)).toBe(0)
    expect(placementPoints(2.5)).toBe(0)
  })
})

describe('placementLabel — oznaka uvrstitve', () => {
  test('posamezna mesta 1–4', () => {
    expect(placementLabel(1)).toBe('1. mesto')
    expect(placementLabel(4)).toBe('4. mesto')
  })
  test('razponi 5.–8. in 9.–16.', () => {
    expect(placementLabel(5)).toBe('5.–8. mesto')
    expect(placementLabel(8)).toBe('5.–8. mesto')
    expect(placementLabel(9)).toBe('9.–16. mesto')
    expect(placementLabel(16)).toBe('9.–16. mesto')
  })
  test('17+ pokaže dobesedno mesto', () => {
    expect(placementLabel(17)).toBe('17. mesto')
  })
})
