import { describe, test, expect } from 'vitest'
import rangSource from './rangLestvica.ts?raw'
import migracija from '../../supabase/migrations/20261002_02_kazen_odbitek_tock.sql?raw'
import povratek from '../../supabase/rollback/20261002_02_kazen_odbitek_tock_ROLLBACK.sql?raw'
import motor from '../engines/league.ts?raw'
import tabela from '../components/LeagueTable.tsx?raw'

/**
 * KAZEN SE NE SME IZGUBITI MED POIZVEDBO IN LESTVICO.
 *
 * Odbitek živi na `league_teams`, ker se `teams` podaja v vse tri funkcije za
 * lestvico — tako pride v vsak izračun sam in ga ni mogoče pozabiti na enem
 * od osmih klicnih mest.
 *
 * Ostane pa ena luknja: poizvedba, ki stolpce našteje POIMENSKO. Taka
 * poizvedba stolpca ne vrne, `penalty_points` je `undefined` → 0, izračun pa
 * tiho vrne lestvico PRED kaznijo. V `rangLestvica.ts` je prav taka poizvedba
 * in iz njenih ekip se računa končna uvrstitev v ligi (uvrstitvene točke za
 * Super ligo in Pokal). Javna lestvica bi kazala en vrstni red, rang lestvica
 * pa bi točke delila po drugem — brez ene same napake v dnevniku.
 */

/**
 * Komentarje odstranimo, ker to past OPISUJEJO. Brez tega bi test prebral
 * »penalty_points« iz lastne opombe in zelenel, tudi če bi stolpec iz
 * poizvedbe izpadel.
 */
const brezKomentarjev = (vir: string) => vir
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

describe('poizvedbe prinesejo odbitek', () => {
  const koda = brezKomentarjev(rangSource)

  test('rangLestvica izbere penalty_points', () => {
    expect(koda, "poizvedbe nad league_teams ni več — preveri rangLestvico")
      .toMatch(/from\('league_teams'\)/)
    expect(koda, 'poizvedba z final_rank mora izbrati tudi penalty_points')
      .toMatch(/final_rank,\s*penalty_points/)
  })

  test('kdor kliče calculateStandings, ekipe bere s kaznijo', () => {
    // Če bi kdo dodal nov klic z lastno poizvedbo brez stolpca, naj ga ta
    // test opozori: vsak `from('league_teams')` v tej datoteki, ki našteva
    // stolpce, mora bodisi vzeti `*` bodisi vključiti penalty_points.
    const kosi = koda.split("from('league_teams')").slice(1)
    for (const kos of kosi) {
      const sel = /\.select\(([^)]*)\)/.exec(kos)
      if (!sel) continue
      const seznam = sel[1]
      // Poizvedbe, ki ekip ne uporabijo za lestvico (npr. samo club_name za
      // pripis kluba igralcu), stolpca ne potrebujejo — prepoznamo jih po
      // tem, da ne berejo niti final_rank niti draw_number.
      const zaLestvico = /final_rank|draw_number/.test(seznam)
      if (!zaLestvico) continue
      expect(seznam, 'poizvedba za lestvico brez penalty_points')
        .toMatch(/\*|penalty_points/)
    }
  })
})

describe('motor odšteje kazen na enem mestu', () => {
  test('obstaja ena sama izpeljava točk', () => {
    // Tri lestvice so prej vsaka zase računale `won * winPts + …`. Dokler je
    // izpeljava ena, se kazen ne more upoštevati v eni in izpustiti v drugi.
    expect(motor).toMatch(/function scoreTeam\(/)
    const vrstice = motor.match(/s\.won \* winPts/g) ?? []
    expect(vrstice.length, 'izpeljava točk se je spet razcepila').toBe(1)
  })

  test('odbitek se odšteje, ne prišteje', () => {
    expect(motor).toMatch(/- s\.penaltyPoints/)
  })

  test('negativna vrednost iz baze ne doda točk', () => {
    expect(motor, 'penaltyPoints mora biti omejen na >= 0').toMatch(/Math\.max\(0, team\.penalty_points/)
  })
})

describe('lestvica odbitek pokaže', () => {
  test('kaznovane ekipe so naštete pod tabelo', () => {
    // Odbitek brez razlage je na lestvici videti kot napaka v izračunu.
    expect(tabela).toMatch(/penaltyPoints > 0/)
    expect(tabela).toMatch(/penalty_note/)
  })
})

describe('migracija in povratek', () => {
  test('stolpca sta idempotentna', () => {
    expect(migracija).toMatch(/add column if not exists penalty_points integer not null default 0/)
    expect(migracija).toMatch(/add column if not exists penalty_note text/)
  })

  test('CHECK ne dovoli negativnega odbitka', () => {
    expect(migracija).toMatch(/check \(penalty_points >= 0\)/)
    // Pred `add` mora biti `drop … if exists`, da je migracija no-op na
    // produkciji (CLAUDE.md).
    expect(migracija).toMatch(/drop constraint if exists league_teams_penalty_points_check/)
  })

  test('povratek pospravi oba stolpca in omejitev', () => {
    for (const kos of [
      'drop constraint if exists league_teams_penalty_points_check',
      'drop column if exists penalty_note',
      'drop column if exists penalty_points',
    ]) {
      expect(povratek, `povratek ne pospravi: ${kos}`).toContain(kos)
    }
  })
})
