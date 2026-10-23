import { describe, test, expect } from 'vitest'

/**
 * VSAKA NOVA TABELA MORA V ISTI MIGRACIJI DOBITI PRAVICE.
 *
 * Supabase od 30. 10. 2026 novim tabelam v shemi `public` pravic za Data API
 * ne podeli več sam. Doslej je to opravil privzetek `alter default
 * privileges`, zato so migracije pravice lahko izpuščale in se je vseeno vse
 * izšlo — a samo na projektu, ki je ta privzetek že imel.
 *
 * Napaka, ki jo to lovi, je tiha. Migracija brez `grant` se izvede BREZ
 * NAPAKE; obnovljena baza pa prek PostgREST na vsako poizvedbo vrne
 * »permission denied«. CLAUDE.md popisuje, da smo 7. 8. 2026 ob prvi resni
 * obnovi iz repozitorija našli devet razhajanj — nobenega ne bi opazili ob
 * obnovi, ampak šele ob prvem turnirju. To je deseto iste vrste.
 *
 * RLS tega ne nadomesti: RLS izbira VRSTICE, grant pa odloča, ali odjemalec
 * tabelo sploh vidi.
 */

const migracije = import.meta.glob('../../supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

/**
 * SQL brez komentarjev; komentarji smejo govoriti o `create table` in `grant`.
 *
 * Nize preskočimo znak za znakom. Z navadnim regularnim izrazom bi dva
 * vezaja SREDI niza (npr. v besedilu za `comment on`) požrla preostanek
 * prave vrstice in s tem lahko skrila `grant` ali pa izmislila tabelo.
 * Preskočimo tudi telesa funkcij med `$$`, ki so svoj jezik.
 */
function brezKomentarjev(sql: string): string {
  let out = ''
  let i = 0
  while (i < sql.length) {
    const c = sql[i]
    if (c === "'") {
      out += c; i++
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") { out += "''"; i += 2; continue }
        if (sql[i] === "'") { out += "'"; i++; break }
        out += sql[i]; i++
      }
      continue
    }
    const dolar = sql.slice(i).match(/^\$[a-z_]*\$/i)
    if (dolar) {
      const oznaka = dolar[0]
      const konec = sql.indexOf(oznaka, i + oznaka.length)
      out += ' '
      i = konec < 0 ? sql.length : konec + oznaka.length
      continue
    }
    if (c === '-' && sql[i + 1] === '-') { while (i < sql.length && sql[i] !== '\n') i++; continue }
    if (c === '/' && sql[i + 1] === '*') {
      i += 2
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++
      i += 2; continue
    }
    out += c; i++
  }
  return out
}

/** Imena tabel, ki jih migracija ustvari v shemi `public`. */
function ustvarjeneTabele(sql: string): string[] {
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi
  return [...brezKomentarjev(sql).matchAll(re)].map(m => m[1].toLowerCase())
}

/**
 * Ali datoteka tabeli kjerkoli podeli pravice — po želji za določeno vlogo.
 *
 * Vlogo iščemo do podpičja za `on <tabela>`, da `grant ... on druga_tabela to
 * service_role` ne obvelja za to tabelo.
 */
function imaPravice(sql: string, tabela: string, vloga?: string): boolean {
  const re = new RegExp(
    `grant\\s+[\\s\\S]{0,120}?\\son\\s+(?:public\\.)?"?${tabela}"?\\s([^;]*);`, 'gi')
  for (const m of brezKomentarjev(sql).matchAll(re)) {
    if (!vloga) return true
    if (new RegExp(`\\b${vloga}\\b`, 'i').test(m[1])) return true
  }
  return false
}

const datoteke = Object.entries(migracije).map(([pot, sql]) => ({
  ime: pot.split('/').pop() as string,
  sql,
  tabele: ustvarjeneTabele(sql),
}))

describe('migracije podelijo pravice tabelam, ki jih ustvarijo', () => {
  test('glob je res prebral migracije', () => {
    expect(datoteke.length, 'nobena migracija ni bila prebrana').toBeGreaterThan(50)
  })

  test('vsaka ustvarjena tabela dobi pravice v svoji migraciji', () => {
    const manjka: string[] = []
    for (const d of datoteke) {
      for (const t of d.tabele) {
        if (!imaPravice(d.sql, t)) manjka.push(`${d.ime} → ${t}`)
      }
    }
    expect(manjka, [
      'Te tabele se ustvarijo brez pravic za Data API.',
      'Po 30. 10. 2026 jih Supabase ne podeli več sam, zato bi bila baza,',
      'obnovljena iz repozitorija, prek PostgREST nedostopna — migracije pa',
      'bi se izvedle brez ene same napake. Dodaj v isto migracijo:',
      '',
      '  grant all on public.<tabela> to anon, authenticated, service_role;',
      '',
      'Dostop naj omejuje RLS, ne odsotnost pravic.',
      '',
      ...manjka.map(m => `  ✗ ${m}`),
    ].join('\n')).toEqual([])
  })

  test('do vsake tabele pride strežniški ključ', () => {
    // service_role obide RLS, zato nanj stoji vsaka strežniška končna točka
    // (api/*). Tabela brez te pravice se v obnovljeni bazi ne pokvari vidno —
    // odpove šele tisti uvoz ali zlitje, ki jo potrebuje. Natanko to je
    // manjkalo pri `guest_players`.
    const manjka: string[] = []
    for (const d of datoteke) {
      for (const t of d.tabele) {
        if (!imaPravice(d.sql, t, 'service_role')) manjka.push(`${d.ime} → ${t}`)
      }
    }
    expect(manjka, 'tem tabelam v obnovljeni bazi ne bi mogel do njih strežniški ključ:\n'
      + manjka.map(m => `  ✗ ${m}`).join('\n')).toEqual([])
  })

  test('zajeli smo vse tabele, ki jih repozitorij ustvarja', () => {
    // Varovalo pred tem, da bi regularni izraz nekega dne nehal loviti in bi
    // test postal zelen, ker ne najde več ničesar.
    const vse = datoteke.flatMap(d => d.tabele)
    expect(new Set(vse).size, 'število ustvarjenih tabel se je zmanjšalo — ali regex ne lovi več?')
      .toBeGreaterThanOrEqual(26)
  })
})
