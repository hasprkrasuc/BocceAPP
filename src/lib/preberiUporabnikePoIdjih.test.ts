import { describe, test, expect, vi, beforeEach } from 'vitest'

/**
 * Regresija: rang lestvica je 1. 9. 2026 namesto imen izpisala `?? <id>`.
 *
 * Imena je brala v ENI zahtevi z vsemi id-ji naenkrat. Ko je pokal na
 * lestvico prinesel ~750 igralcev, je `in('id', …)` zrasel v URL, dolg
 * ~28 kB, in poizvedba je padla. Koda je brala samo `data`, zato je napaka
 * prišla kot prazen rezultat — vsa imena so izpadla naenkrat, klubi pa so
 * ostali, ker ne pridejo iz te poizvedbe.
 */

const zahteve: string[][] = []
let vrniNapako: { message: string } | null = null

/** Meja, pri kateri strežnik zavrne predolg URL. UUID + ločilo ≈ 40 znakov. */
const NAJVEC_ID_NA_ZAHTEVO = 400

vi.mock('../supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: (_stolpec: string, idji: string[]) => {
          zahteve.push(idji)
          if (vrniNapako) return Promise.resolve({ data: null, error: vrniNapako })
          if (idji.length > NAJVEC_ID_NA_ZAHTEVO) {
            return Promise.resolve({ data: null, error: { message: 'URI too long' } })
          }
          return Promise.resolve({
            data: idji.map(id => ({ id, full_name: `Igralec ${id}`, club: 'Klub' })),
            error: null,
          })
        },
      }),
    }),
  },
}))

const { preberiUporabnikePoIdjih } = await import('./rangLestvica')

const idji = (n: number) =>
  Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)

describe('preberiUporabnikePoIdjih', () => {
  beforeEach(() => { zahteve.length = 0; vrniNapako = null })

  test('750 igralcev dobi ime — nobeden ne izpade', async () => {
    const seznam = idji(750)
    const zemljevid = await preberiUporabnikePoIdjih<{ id: string; full_name: string }>(
      seznam, 'id, full_name, club')
    expect(Object.keys(zemljevid)).toHaveLength(750)
    for (const id of seznam) {
      expect(zemljevid[id]?.full_name, `${id} je ostal brez imena`).toBe(`Igralec ${id}`)
    }
  })

  test('bere v več zahtevah, nobena ni predolga', async () => {
    await preberiUporabnikePoIdjih(idji(750), 'id, full_name')
    expect(zahteve.length, 'vse naenkrat — prav to je padlo').toBeGreaterThan(1)
    for (const z of zahteve) expect(z.length).toBeLessThanOrEqual(NAJVEC_ID_NA_ZAHTEVO)
  })

  test('majhen seznam gre v eni zahtevi', async () => {
    await preberiUporabnikePoIdjih(idji(12), 'id, full_name')
    expect(zahteve).toHaveLength(1)
  })

  test('prazen seznam ne sproži poizvedbe', async () => {
    expect(await preberiUporabnikePoIdjih([], 'id, full_name')).toEqual({})
    expect(zahteve).toHaveLength(0)
  })

  test('podvojeni id-ji se preberejo enkrat', async () => {
    const eden = idji(1)[0]
    await preberiUporabnikePoIdjih([eden, eden, eden], 'id, full_name')
    expect(zahteve[0]).toEqual([eden])
  })

  test('napaka se vrže naprej, ne požre', async () => {
    vrniNapako = { message: 'nekaj je šlo narobe' }
    await expect(preberiUporabnikePoIdjih(idji(5), 'id, full_name'))
      .rejects.toMatchObject({ message: 'nekaj je šlo narobe' })
  })
})
