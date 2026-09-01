import { describe, test, expect } from 'vitest'

/**
 * Javna prijava na tekmovanje mora upoštevati disciplino.
 *
 * Obrazec je nekoč zahteval partnerja VEDNO in vedno vpisal `player2_id`.
 * Na Državnem prvenstvu posamezno se zato ni bilo mogoče prijaviti drugače
 * kot v paru — na posamični disciplini nesmisel. Admin je isto razliko že
 * poznal (`isPairDiscipline` v TournamentEdit), javna stran pa ne.
 */

const viri = import.meta.glob('./*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const STRAN = './Tournament.tsx'

describe('prijava na tekmovanje loči posamično od dvojic', () => {
  test('glob je res kaj prebral', () => {
    expect(viri[STRAN], `datoteke ${STRAN} ni med prebranimi`).toBeDefined()
  })

  test('stran vpraša po disciplini', () => {
    expect(viri[STRAN], 'Tournament.tsx ne uporablja isPairDiscipline — prijava ne loči posamičnih tekmovanj od dvojic')
      .toMatch(/isPairDiscipline\s*\(/)
  })

  test('partner ni brezpogojna zahteva', () => {
    // Stara koda: `if (!regForm.partner) { setRegError('Izberi partnerja'); return }`
    // takoj na začetku handleRegister, brez pogoja o disciplini.
    const telo = viri[STRAN].slice(
      viri[STRAN].indexOf('async function handleRegister'),
      viri[STRAN].indexOf('async function handleSaveScore'),
    )
    expect(telo.length, 'handleRegister ni bilo mogoče najti').toBeGreaterThan(0)
    expect(telo, 'zahteva po partnerju mora biti pogojena z disciplino')
      .toMatch(/if\s*\(\s*jeDvojka\s*\)/)
    expect(telo, 'player2_id se mora pri posamični disciplini vpisati kot null')
      .toMatch(/player2_id:\s*jeDvojka\s*\?/)
  })
})
