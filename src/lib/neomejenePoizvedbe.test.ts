import { describe, test, expect } from 'vitest'

/**
 * PostgREST vrne največ 1000 vrstic in o ostalih ne pove nič.
 *
 * V tem projektu se je to zgodilo trikrat: seznam uporabnikov se je odrezal
 * pri črki S, v spustnih menijih lige je od 1173 igralcev manjkalo 173, in
 * 29. 8. 2026 sodnika Branka Sedeja na prvenstvu ni bilo mogoče izbrati, ker
 * se je od 4054 vrstic ligaških postav prebralo 1000. Vsakič je bil izid
 * enak: krnjen seznam brez napake, ki je videti kot "tega ni".
 *
 * Ta test poišče poizvedbe nad velikimi tabelami, ki nimajo NE omejitve
 * (`range`, `limit`, `single`, `maybeSingle`, štetje) NE zožitve (`eq`, `in`,
 * `contains` …). Take res preberejo celo tabelo in se tiho odrežejo.
 *
 * Kar test namenoma NE lovi: poizvedbe z zožitvijo, ki bi kljub temu lahko
 * presegle 1000 vrstic. Koliko vrstic vrne `eq('season_id', …)`, se iz kode ne
 * da vedeti, in vsak poskus ugibanja bi test spremenil v šum — ob prvem
 * lažnem pozitivu bi ga nekdo utišal in s tem izgubili tudi prave zadetke.
 */

// Tabele, ki so presegle ali se bližajo 1000 vrsticam (stanje 30. 8. 2026).
const VELIKE_TABELE: Record<string, number> = {
  league_match_discipline_results: 17823,
  league_team_players: 4056,
  league_fixtures: 2182,
  users: 1639,
  league_match_results: 1613,
  matches: 923,
}

const OMEJITEV = /\.(range|limit|single|maybeSingle)\s*\(|count\s*:/
const ZOZITEV = /\.(eq|in|contains|overlaps|or|match|filter|textSearch)\s*\(/

/** Veriga klicev od `from(` naprej: nadaljuje se, dokler naslednja vrstica pade na `.`. */
function veriga(source: string, zacetek: number): string {
  let globina = 0
  let i = zacetek
  for (; i < source.length; i++) {
    const c = source[i]
    if (c === '(') globina++
    else if (c === ')') { globina--; if (globina < 0) break }
    else if (globina === 0 && c === '\n') { if (!/^\s*\./.test(source.slice(i + 1))) break }
    else if (globina === 0 && (c === ';' || c === ',')) break
  }
  return source.slice(zacetek, i)
}

/**
 * Ime tovarne, če je veriga telo puščične funkcije: `const F = () => supabase.from(…)`.
 * Filtri se pri taki napišejo šele na klicnem mestu, zato je treba pogledati tja.
 */
function tovarna(source: string, zacetek: number): string | null {
  const pred = source.slice(Math.max(0, zacetek - 200), zacetek)
  // Med puščico in `from(` stoji še `supabase.` — zato dovolimo dostop do članov.
  return /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*\([^)]*\)\s*=>\s*(?:[\w$]+\.)*$/.exec(pred)?.[1] ?? null
}

export interface Zadetek { datoteka: string; vrstica: number; tabela: string; koda: string }

export function najdiNeomejene(source: string, datoteka: string): Zadetek[] {
  const najdeni: Zadetek[] = []
  for (const tabela of Object.keys(VELIKE_TABELE)) {
    const re = new RegExp(`from\\(['"]${tabela}['"]\\)`, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(source)) !== null) {
      const v = veriga(source, m.index)
      if (!/\.select\s*\(/.test(v)) continue
      if (OMEJITEV.test(v) || ZOZITEV.test(v)) continue

      // Tovarna: varna je le, če ima VSAKO klicno mesto omejitev ali zožitev.
      const ime = tovarna(source, m.index)
      if (ime) {
        const klici = [...source.matchAll(new RegExp(`\\b${ime}\\(\\)`, 'g'))]
        if (klici.length > 0 && klici.every(k => {
          const kv = veriga(source, k.index!)
          return OMEJITEV.test(kv) || ZOZITEV.test(kv)
        })) continue
      }

      najdeni.push({
        datoteka,
        vrstica: source.slice(0, m.index).split('\n').length,
        tabela,
        koda: v.replace(/\s+/g, ' ').slice(0, 120),
      })
    }
  }
  return najdeni
}

describe('pravilo samo po sebi', () => {
  test('ujame natanko tisto poizvedbo, ki je skrila Branka Sedeja', () => {
    const stara = `const { data } = await supabase.from('league_team_players').select('player_id')`
    expect(najdiNeomejene(stara, 'x.ts')).toHaveLength(1)
  })

  test('popravljena različica je čista', () => {
    const nova = `
      const postave = await fetchAllRows((od, doVkljucno) =>
        supabase.from('league_team_players').select('player_id')
          .order('player_id').range(od, doVkljucno))`
    expect(najdiNeomejene(nova, 'x.ts')).toHaveLength(0)
  })

  test('zožitev z eq ali in je dovolj', () => {
    expect(najdiNeomejene(`supabase.from('users').select('id').eq('club_id', k)`, 'x.ts')).toHaveLength(0)
    expect(najdiNeomejene(`supabase.from('users').select('id').in('id', ids)`, 'x.ts')).toHaveLength(0)
  })

  test('tovarna z omejitvijo na klicnem mestu ni napaka', () => {
    // Vzorec iz Home.tsx: veriga se dokonča šele tam, kjer se uporabi.
    const src = `
      const F = () => supabase.from('league_fixtures').select(LIGA_SELECT)
      const a = await F().eq('status', 'completed').limit(3)
      const b = await F().neq('status', 'completed').gte('scheduled_date', d).limit(3)`
    expect(najdiNeomejene(src, 'Home.tsx')).toHaveLength(0)
  })

  test('tovarna BREZ omejitve na klicnem mestu je napaka', () => {
    const src = `
      const F = () => supabase.from('league_fixtures').select('*')
      const a = await F().order('scheduled_date')`
    expect(najdiNeomejene(src, 'x.tsx')).toHaveLength(1)
  })
})

describe('nobena poizvedba v src/ ne bere velike tabele brez omejitve', () => {
  const moduli = import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

  test('pregled celotne kode', () => {
    const zadetki: Zadetek[] = []
    for (const [pot, source] of Object.entries(moduli)) {
      if (/\.test\.tsx?$/.test(pot)) continue
      zadetki.push(...najdiNeomejene(source, pot))
    }
    expect(
      zadetki.map(z => `${z.datoteka}:${z.vrstica} [${z.tabela}, ${VELIKE_TABELE[z.tabela]} vrstic] ${z.koda}`),
      'poizvedba bere celo veliko tabelo — PostgREST jo bo odrezal pri 1000 vrsticah in ' +
        'ostalih ne omenil. Uporabi fetchAllRows iz src/lib/fetchAllRows.ts ali dodaj zožitev.',
    ).toEqual([])
  })

  test('pregled je res kaj prebral', () => {
    // Brez tega bi test ostal zelen tudi, če bi glob nehal delovati.
    expect(Object.keys(moduli).length).toBeGreaterThan(50)
  })
})
