import { describe, test, expect } from 'vitest'
import ligaSource from '../pages/League.tsx?raw'
import ligaAdminSource from '../pages/admin/LeagueAdmin.tsx?raw'
import migracijaVodje from '../../supabase/migrations/20260827_03_zapisnik_vodje_kartoni.sql?raw'

/**
 * PAST VEZNIH TABEL.
 *
 * PostgREST sam odkriva zveze med tabelami. Tabelo z natanko dvema tujima
 * ključema, ki hkrati sestavljata primarni ključ, prepozna kot VEZNO in ponudi
 * povezavo mnogo-proti-mnogo skozi njo. Če med istima tabelama obstaja še
 * neposredni tuji ključ, ima poizvedba dve poti — PostgREST odgovori s
 * 300 Multiple Choices in poizvedba pade.
 *
 * 27. 8. 2026 je to podrlo obe strani s postavami. Migracija
 * `20260827_03_zapisnik_vodje_kartoni.sql` je uvedla `team_leaders` s
 * primarnim ključem (league_team_id, user_id) — od takrat vodi od
 * `league_teams` do `users` poleg `captain_id` še pot prek vodij. Vgnezdenje
 * `captain:users(...)` je postalo dvoumno, poizvedba je vrnila napako, koda pa
 * je napako pogoltnila in izrisala prazen seznam. Ekipe in igralci državnih
 * lig so bili videti izbrisani, čeprav so bili v bazi nedotaknjeni.
 *
 * Zakaj `league_team_players` iste težave ne dela: ima nadomestni primarni
 * ključ (id), zato ni vezna tabela. Razlika je natanko v obliki ključa.
 *
 * Rešitev je imenovati tuji ključ. Ta test to zaklene — in velja tudi za
 * vsako prihodnjo vezno tabelo med `league_teams` in `users`.
 */

/** Vsi klici .select(...) v izvorni kodi, skupaj z imenom tabele iz .from(). */
function poizvedbeIz(source: string, tabela: string): string[] {
  const najdbe: string[] = []
  const re = new RegExp(`from\\('${tabela}'\\)`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    // Od .from(...) do konca klica .select(...): dovolj za pregled vgnezdenj.
    const odsek = source.slice(m.index, m.index + 1200)
    const sel = odsek.indexOf('.select(')
    if (sel === -1) continue
    najdbe.push(odsek.slice(sel, odsek.indexOf('\n', odsek.indexOf(')', sel))))
  }
  return najdbe
}

describe('vgnezdenje users iz league_teams je enolično', () => {
  const strani: Array<[string, string]> = [
    ['src/pages/League.tsx', ligaSource],
    ['src/pages/admin/LeagueAdmin.tsx', ligaAdminSource],
  ]

  for (const [ime, source] of strani) {
    test(`${ime} imenuje tuji ključ pri captain`, () => {
      const poizvedbe = poizvedbeIz(source, 'league_teams')
      expect(poizvedbe.length, `v ${ime} ni poizvedbe nad league_teams`).toBeGreaterThan(0)

      for (const q of poizvedbe) {
        if (!q.includes('captain:users')) continue
        expect(
          q.includes('captain:users!league_teams_captain_id_fkey'),
          `${ime}: captain:users brez imena tujega ključa. Odkar obstaja vezna ` +
            'tabela team_leaders, PostgREST tega ne zna razrešiti in vrne 300 — ' +
            'seznam ekip ostane prazen.',
        ).toBe(true)
      }
    })
  }

  test('team_leaders je res vezna tabela — od tod izvira dvoumnost', () => {
    // Če bi kdo primarni ključ zamenjal za nadomestnega, past izgine in ta
    // test naj pade, da se komentarji zgoraj popravijo.
    expect(migracijaVodje).toMatch(/primary key \(league_team_id, user_id\)/i)
  })

  test('napaka pri branju ekip se izpiše, ne pogoltne', () => {
    // Brez tega je dvoumno vgnezdenje videti kot »ni ekip«, ne kot napaka.
    expect(ligaAdminSource).toMatch(/Ekip ni bilo mogoče naložiti/)
  })
})
