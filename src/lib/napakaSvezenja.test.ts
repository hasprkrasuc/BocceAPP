import { describe, it, expect } from 'vitest'
import { jeNapakaSvezenja, smemoOsveziti, RAZMIK_OSVEZITVE_MS } from './napakaSvezenja'

describe('jeNapakaSvezenja — prepozna manjkajoč sveženj v vseh brskalnikih', () => {
  it.each([
    ['Chrome',  'Failed to fetch dynamically imported module: https://balinar.app/assets/ClubAdmin-a1b2c3.js'],
    ['Firefox', 'error loading dynamically imported module'],
    ['Safari',  'Importing a module script failed.'],
    ['Vite CSS','Unable to preload CSS for /assets/LeagueAdmin-d4e5f6.css'],
    ['Webpack', 'ChunkLoadError: Loading chunk 42 failed.'],
  ])('%s', (_ime, sporocilo) => {
    expect(jeNapakaSvezenja(new Error(sporocilo))).toBe(true)
  })

  it('prepozna tudi golo besedilo, ne le Error', () => {
    expect(jeNapakaSvezenja('Failed to fetch dynamically imported module')).toBe(true)
  })

  it('navadnih napak v kodi NE zamenja za manjkajoč sveženj', () => {
    // Te je treba pokazati razvijalcu, ne pa tiho osveževati strani.
    for (const n of [
      new TypeError("Cannot read properties of undefined (reading 'map')"),
      new Error('Supabase: JWT expired'),
      new RangeError('Maximum call stack size exceeded'),
      new Error('Network request failed'),
    ]) {
      expect(jeNapakaSvezenja(n)).toBe(false)
    }
  })

  it('prazna vrednost ni napaka svežnja', () => {
    expect(jeNapakaSvezenja(null)).toBe(false)
    expect(jeNapakaSvezenja(undefined)).toBe(false)
  })

  it('velike/male črke niso pomembne', () => {
    expect(jeNapakaSvezenja(new Error('FAILED TO FETCH DYNAMICALLY IMPORTED MODULE'))).toBe(true)
  })
})

describe('smemoOsveziti — varovalo pred zanko osveževanja', () => {
  it('prvič vedno smemo', () => {
    expect(smemoOsveziti(null, 1_000_000)).toBe(true)
  })

  it('takoj po osvežitvi ne smemo — sicer bi se stran vrtela v neskončnost', () => {
    const zdaj = 1_000_000
    expect(smemoOsveziti(zdaj, zdaj)).toBe(false)
    expect(smemoOsveziti(zdaj, zdaj + RAZMIK_OSVEZITVE_MS - 1)).toBe(false)
  })

  it('po preteku razmika spet smemo — naslednja objava mora spet delovati', () => {
    const zdaj = 1_000_000
    expect(smemoOsveziti(zdaj, zdaj + RAZMIK_OSVEZITVE_MS)).toBe(true)
    expect(smemoOsveziti(zdaj, zdaj + 3 * 60 * 60 * 1000)).toBe(true)
  })

  it('pokvarjen zapis v shrambi obravnavamo kot "še ni bilo osvežitve"', () => {
    expect(smemoOsveziti(Number.NaN, 1_000_000)).toBe(true)
    expect(smemoOsveziti(Number.POSITIVE_INFINITY, 1_000_000)).toBe(true)
  })
})
