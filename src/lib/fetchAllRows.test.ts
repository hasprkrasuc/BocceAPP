import { describe, test, expect, vi } from 'vitest'
import { fetchAllRows, VELIKOST_STRANI } from './fetchAllRows'

/** Ponaredek vira: vrne toliko vrstic, kolikor jih je v podanem obsegu. */
function vir(skupaj: number) {
  return vi.fn(async (od: number, doVkljucno: number) => ({
    data: Array.from(
      { length: Math.max(0, Math.min(doVkljucno, skupaj - 1) - od + 1) },
      (_, i) => ({ id: od + i }),
    ),
    error: null,
  }))
}

describe('fetchAllRows', () => {
  test('vrne VSE vrstice, tudi ko jih je vec kot ena stran', async () => {
    const v = vir(2500)
    const vse = await fetchAllRows<{ id: number }>(v)
    expect(vse).toHaveLength(2500)
    expect(vse[0].id).toBe(0)
    expect(vse[2499].id).toBe(2499)
  })

  test('pri manj kot eni strani naredi en sam klic', async () => {
    const v = vir(42)
    expect(await fetchAllRows(v)).toHaveLength(42)
    expect(v).toHaveBeenCalledTimes(1)
  })

  test('pri tocno eni polni strani naredi se drugi klic, da ugotovi konec', async () => {
    const v = vir(VELIKOST_STRANI)
    expect(await fetchAllRows(v)).toHaveLength(VELIKOST_STRANI)
    expect(v).toHaveBeenCalledTimes(2)
  })

  test('prazen vir vrne prazen seznam', async () => {
    expect(await fetchAllRows(vir(0))).toEqual([])
  })

  test('obsegi se ne prekrivajo in ne puscajo lukenj', async () => {
    const v = vir(2500)
    await fetchAllRows(v)
    const klici = v.mock.calls.map(([od, doV]) => [od, doV])
    expect(klici[0]).toEqual([0, VELIKOST_STRANI - 1])
    expect(klici[1]).toEqual([VELIKOST_STRANI, VELIKOST_STRANI * 2 - 1])
  })

  test('napako vrze naprej in NE vrne krnjenega seznama', async () => {
    const v = vi.fn(async () => ({ data: null, error: new Error('nekaj je slo narobe') }))
    await expect(fetchAllRows(v)).rejects.toThrow('nekaj je slo narobe')
  })

  test('data = null brez napake pomeni konec, ne pa tiho prazen izid', async () => {
    const v = vi.fn(async () => ({ data: null, error: null }))
    expect(await fetchAllRows(v)).toEqual([])
  })
})
