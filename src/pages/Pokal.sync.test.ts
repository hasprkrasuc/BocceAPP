import { describe, test, expect } from 'vitest'
import pokal from './Pokal.tsx?raw'

/**
 * Menjava domačina sme biti zavrnjena po VSEBINI zapisnika, ne po obstoju.
 *
 * Prva izvedba je štela vrstice v `league_match_results` in zavrnila, brž ko
 * je kakšna obstajala. Odpiranje »Uredi zapisnik« pa vrstico in prazne
 * discipline ustvari vnaprej — zato je že sam OGLED zapisnika trajno zaklenil
 * gumb ⇄. Na pokalu članic 2026 (Šiška–Sivke) je bilo treba domačina
 * zamenjati mimo aplikacije, naravnost v bazi.
 */

const telo = pokal.slice(
  pokal.indexOf('async function zamenjajDomacina'),
  pokal.indexOf('if (nalagam)'),
)

describe('zamenjava domačina', () => {
  test('funkcija obstaja', () => {
    expect(telo.length, 'zamenjajDomacina ni bilo mogoče najti').toBeGreaterThan(0)
  })

  test('ne odloča več po številu vrstic zapisnika', () => {
    expect(telo, 'šteje vrstice namesto da bi pogledal vsebino')
      .not.toMatch(/count:\s*'exact'/)
    expect(telo).not.toMatch(/\(count \?\? 0\) > 0/)
  })

  test('odloča motor, ki pozna vsebino', () => {
    expect(telo).toMatch(/zapisnikJePrazen\(/)
  })

  test('izid in končana tekma ostaneta oviri', () => {
    // Pri izpolnjenem zapisniku bi obrat strani pripisal postave napačni ekipi.
    expect(telo).toMatch(/status === 'completed'/)
    expect(telo).toMatch(/home_score !== null/)
  })

  test('zavrnjena poizvedba ne velja za »ni zapisnika«', () => {
    // Tiho prazen odgovor bi pomenil obrat strani izpolnjenemu zapisniku.
    expect(telo, 'napaka poizvedbe mora ustaviti menjavo').toMatch(/if \(zErr\)/)
  })
})
