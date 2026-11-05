import { describe, test, expect } from 'vitest'

/**
 * POLITIKA `for all` NE SME VISETI NA JAVNO BRANIH TABELAH.
 *
 * Permisivne politike se OR-ajo, zato `for all` pokriva tudi SELECT. Kadar ima
 * tabela javno bralno politiko `using (true)`, admin politika k branju ne
 * prispeva ničesar — vrednoti pa svoj predikat pri VSAKI prebrani vrstici.
 *
 * To je projekt stalo dvakrat:
 *
 *   29. 7. 2026  `20260729_06_perf_rls_initplan.sql` vzorec odpravi in ga v
 *                svoji glavi poimenuje.
 *    9. 8. 2026  `20260809_01_ligaski_admin.sql` ga po nesreči vrne, ker nove
 *                politike napiše po starem vzorcu.
 *    4. 11. 2026 Supabase javi, da projektu poteka proračun za diskovni V/I.
 *                `league_match_discipline_results` (7 MB, 21 tisoč vrstic) je
 *                bila zaporedno prebrana 4,2 MILIJARDE vrstic.
 *
 * Test ne razume SQL — išče točno obliko, ki se je vrnila: `for all` nad eno
 * od tabel, ki jih bere javna stran.
 */

const migracije = import.meta.glob('../../supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

/** Tabele z javno bralno politiko, ki jih bere javni del aplikacije. */
const JAVNO_BRANE = [
  'league_teams',
  'izbijanje_izidi',
  'match_cards',
  'league_fixtures',
  'league_season_disciplines',
  'league_team_players',
  'league_match_results',
  'league_match_discipline_results',
  'matches',
  'tournament_groups',
  'group_teams',
  'team_leaders',
]

/** SQL brez komentarjev; nize pustimo, ker iščemo imena tabel v kodi. */
function brezKomentarjev(sql: string): string {
  let out = ''
  let i = 0
  while (i < sql.length) {
    if (sql[i] === "'") {
      out += sql[i]; i++
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") { out += "''"; i += 2; continue }
        if (sql[i] === "'") { out += "'"; i++; break }
        out += sql[i]; i++
      }
      continue
    }
    const dolar = sql.slice(i).match(/^\$[a-z_]*\$/i)
    if (dolar) {
      const konec = sql.indexOf(dolar[0], i + dolar[0].length)
      out += ' '
      i = konec < 0 ? sql.length : konec + dolar[0].length
      continue
    }
    if (sql[i] === '-' && sql[i + 1] === '-') { while (i < sql.length && sql[i] !== '\n') i++; continue }
    out += sql[i]; i++
  }
  return out
}

/**
 * Izhodišče pregleda.
 *
 * `20260729_06_perf_rls_initplan.sql` je politike poenotila in stare pobrisala
 * DINAMIČNO (`execute format('drop policy ...')` v zanki nad seznamom tabel).
 * Statični pregled izvorne kode temu ne more slediti, zato bi vse, kar je
 * nastalo prej, štel za še živo — čeprav v produkciji tega ni. Pregledujemo
 * torej od te migracije naprej; ta je sama izhodišče.
 */
const IZHODISCE = '20260729_06'

/**
 * Zadnja beseda o politiki: migracije tečejo po abecedi, zato velja tisto,
 * kar je bilo nazadnje ustvarjeno ali pobrisano.
 */
function zadnjeStanje(): Map<string, { datoteka: string; zaVse: boolean; tabela: string }> {
  const stanje = new Map<string, { datoteka: string; zaVse: boolean; tabela: string }>()
  const poti = Object.keys(migracije).sort()
    .filter(p => (p.split('/').pop() as string) >= IZHODISCE)
  for (const pot of poti) {
    const koda = brezKomentarjev(migracije[pot])
    const ime = pot.split('/').pop() as string

    for (const m of koda.matchAll(/drop\s+policy\s+(?:if\s+exists\s+)?"([^"]+)"\s+on\s+(?:public\.)?(\w+)/gi)) {
      stanje.delete(`${m[2].toLowerCase()}|${m[1]}`)
    }
    for (const m of koda.matchAll(
      /create\s+policy\s+"([^"]+)"\s+on\s+(?:public\.)?(\w+)([\s\S]{0,80}?)(?:using|with\s+check|;)/gi)) {
      const tabela = m[2].toLowerCase()
      stanje.set(`${tabela}|${m[1]}`, {
        datoteka: ime, tabela,
        zaVse: /\bfor\s+all\b/i.test(m[3]),
      })
    }
  }
  return stanje
}

describe('javno brane tabele nimajo politik »for all«', () => {
  const stanje = zadnjeStanje()

  test('migracije so prebrane in politike najdene', () => {
    expect(Object.keys(migracije).length).toBeGreaterThan(50)
    expect(stanje.size, 'nobene politike ni bilo mogoče razbrati').toBeGreaterThan(30)
  })

  test('nobena politika »for all« ne visi na javno brani tabeli', () => {
    const krsitve: string[] = []
    for (const [kljuc, p] of stanje) {
      if (!p.zaVse) continue
      if (!JAVNO_BRANE.includes(p.tabela)) continue
      krsitve.push(`${p.datoteka}: "${kljuc.split('|')[1]}" na ${p.tabela}`)
    }
    expect(krsitve, [
      'Politika »for all« pokriva tudi SELECT. Te tabele imajo javno bralno',
      'politiko using (true), zato taka politika k branju ne prispeva ničesar —',
      'njen predikat pa se vrednoti pri VSAKI prebrani vrstici.',
      '',
      'Prav to je 4. 11. 2026 izčrpalo proračun za diskovni V/I: ena tabela',
      'je bila zaporedno prebrana 4,2 milijarde vrstic. Razbij politiko na',
      'for insert / for update / for delete.',
      '',
      ...krsitve.map(k => `  ✗ ${k}`),
    ].join('\n')).toEqual([])
  })
})
