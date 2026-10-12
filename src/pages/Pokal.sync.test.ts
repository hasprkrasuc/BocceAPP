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

/**
 * SUPER POKAL — kar se iz motorja ne vidi.
 *
 * Pravila so v engines/superPokal.ts s testi; tu varujemo, da jih stran res
 * uporabi. Vsako od teh mest bi ob opustitvi dalo TIHO napačen izid, ne
 * zloma: napačen domačin, ime kroga »1. krog« namesto »Finale«, prosto mesto
 * namesto tekme.
 */
describe('Super Pokal na strani', () => {
  test('zavihek zajame oba pokalna formata', () => {
    expect(pokal, 'poizvedba sezon ne zajame super_pokal')
      .toMatch(/\.in\('format', \['pokal', 'super_pokal'\]\)/)
  })

  test('domačin gre skozi svoje pravilo, ne skozi pokalno', () => {
    // pokalniDomacin bi pri izzivalcu iz nižje lige strani OBRNIL.
    expect(pokal).toMatch(/jeSuper\s*$|jeSuper\s*\n?\s*\?\s*superPokalDomacin/m)
    expect(pokal).toMatch(/superPokalDomacin\(/)
  })

  test('krog se imenuje Finale, ne »1. krog«', () => {
    expect(pokal).toMatch(/jeSuper \? superPokalKrogi\(\) : oznakeKrogov\(velikost\)/)
  })

  test('vnos se preveri nad VSEMI ekipami, ne le nad tistimi z mestom', () => {
    // `vhod` je prefiltriran na draw_number !== null; ekipa brez mesta bi bila
    // nevidna, ena sama ekipa pa bi pomenila prosto mesto in zmago brez tekme.
    expect(pokal).toMatch(/preveriSuperPokal\(ekipe\)/)
    expect(pokal, 'napake morajo biti vidne tudi obiskovalcu').toMatch(/napakeSuper\.length > 0/)
  })

  test('prostih mest v Super Pokalu ni', () => {
    expect(pokal).toMatch(/!jeSuper && prosti\.length > 0/)
  })
})
