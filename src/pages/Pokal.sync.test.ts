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

/**
 * TERMIN, KRAJ IN SODNIK NA POKALNI KARTICI.
 *
 * Pajek je prej kazal samo ekipi in izid. Kdaj in kje se tekma igra ter kdo
 * jo sodi, je bilo mogoče izvedeti šele v zapisniku — na razporedu lige pa
 * je to na vsaki vrstici. Vsak od teh podatkov ima svojo past, zato svoj
 * test: izpadejo tiho, kot manjkajoče besedilo, ne kot zlom.
 */
describe('podatki o terminu na pokalni kartici', () => {
  test('poizvedba prinese kraj in sodnika', () => {
    // Brez stolpcev v selectu bi bila pasica vedno prazna.
    expect(pokal, 'poizvedba tekem ne izbere venue').toMatch(/venue/)
    expect(pokal, 'poizvedba tekem ne izbere chief_judge_id').toMatch(/chief_judge_id/)
  })

  test('ime sodnika gre skozi ločeno poizvedbo, ne skozi embed', () => {
    // Od league_fixtures do users vodi več poti; embed brez imena tujega
    // ključa vrne 300 Multiple Choices in pajek ostane prazen.
    expect(pokal).toMatch(/from\('users'\)\.select\('id, full_name'\)/)
    expect(pokal, 'embed sodnika prek users je krhek').not.toMatch(/chief_judge:users/)
  })

  test('izpiše se cel datum, ne le ura', () => {
    // Pokal tekem ne grupira po dnevih kot ligaški razpored, zato bi sama ura
    // ne povedala, kdaj se tekma igra.
    expect(pokal).toMatch(/formatMatchDateTime\(tekma\.scheduled_date\)/)
    expect(pokal, 'matchTimePart bi dal samo uro').not.toMatch(/matchTimePart/)
  })

  test('pasica se izriše le ob vpisani tekmi', () => {
    // Pred vnosom termina par poznamo iz žreba, tekme pa ni — ni česa izpisati.
    expect(pokal).toMatch(/tekma && \(tekma\.scheduled_date \|\| tekma\.venue \|\| tekma\.sodnik\)/)
  })

  test('ikona sodnika je deljena z ligo', () => {
    // Kopija ikone bi se ob prvi spremembi razšla med stranema.
    expect(pokal).toMatch(/import WhistleIcon from '\.\.\/components\/WhistleIcon'/)
    expect(pokal, 'ikona ne sme biti prepisana v to datoteko').not.toMatch(/function WhistleIcon/)
  })
})
