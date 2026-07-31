import { describe, test, expect, vi, afterEach } from 'vitest'
import { isGoogleEnabled } from './authProviders'

const URL = 'https://projekt.supabase.co'
const KEY = 'anon-kljuc'

afterEach(() => { vi.unstubAllGlobals() })

function stubFetch(body: unknown, ok = true) {
  const spy = vi.fn().mockResolvedValue({ ok, json: async () => body })
  vi.stubGlobal('fetch', spy)
  return spy
}

describe('isGoogleEnabled', () => {
  test('vrne true, ko je google vklopljen', async () => {
    stubFetch({ external: { email: true, google: true } })
    expect(await isGoogleEnabled(URL, KEY)).toBe(true)
  })

  test('vrne false, ko je google izklopljen', async () => {
    stubFetch({ external: { email: true, google: false } })
    expect(await isGoogleEnabled(URL, KEY)).toBe(false)
  })

  test('vrne false, ko google v odzivu sploh ni naveden', async () => {
    stubFetch({ external: { email: true } })
    expect(await isGoogleEnabled(URL, KEY)).toBe(false)
  })

  test('vrne false, ko external manjka', async () => {
    stubFetch({})
    expect(await isGoogleEnabled(URL, KEY)).toBe(false)
  })

  test('vrne false ob napaki omrezja, ne vrze izjeme', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('brez povezave')))
    expect(await isGoogleEnabled(URL, KEY)).toBe(false)
  })

  test('poklice pravi naslov z apikey glavo', async () => {
    const spy = stubFetch({ external: { google: true } })
    await isGoogleEnabled(URL, KEY)
    expect(spy).toHaveBeenCalledWith(
      `${URL}/auth/v1/settings`,
      { headers: { apikey: KEY } },
    )
  })
})
