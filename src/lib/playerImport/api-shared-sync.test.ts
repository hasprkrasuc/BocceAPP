import { describe, test, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Varuje pred razkorakom med api/import-players.ts (ki NE sme uvažati iz src/, ker Vercel
// zapakira le api/ — glej ERR_MODULE_NOT_FOUND) in izvirnimi implementacijami v src/lib/playerImport/.
// Ker api/import-players.ts bere process.env in izvaža handler, ga tu NE uvažamo — namesto tega
// primerjamo izvorno besedilo obeh datotek.

const here = path.dirname(fileURLToPath(import.meta.url))
const apiPath = path.resolve(here, '../../../api/import-players.ts')
const emsoPath = path.resolve(here, './emso.ts')
const matchPlayersPath = path.resolve(here, './matchPlayers.ts')

const apiSource = readFileSync(apiPath, 'utf8')
const emsoSource = readFileSync(emsoPath, 'utf8')
const matchPlayersSource = readFileSync(matchPlayersPath, 'utf8')

/** Izvleče telo funkcije med zavitima oklepajema, ki se začneta takoj po prvem pojavu `marker`
 *  (odporno na preimenovanje funkcije — marker vsebuje le podpis parametrov/vrnjenega tipa). */
function extractBraceBody(source: string, marker: string, fileLabel: string): string {
  const idx = source.indexOf(marker)
  if (idx === -1) throw new Error(`Ni najdenega markerja "${marker}" v ${fileLabel} — datoteka se je verjetno spremenila`)
  const braceStart = source.indexOf('{', idx)
  if (braceStart === -1) throw new Error(`Ni najdenega "{" po markerju "${marker}" v ${fileLabel}`)
  let depth = 0
  let i = braceStart
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') { depth--; if (depth === 0) break }
  }
  if (depth !== 0) throw new Error(`Nezaključen blok po markerju "${marker}" v ${fileLabel}`)
  return source.slice(braceStart + 1, i)
}

/** Izvleče izraz (arrow funkcija brez zavitih oklepajev) med `marker` in prvo prazno vrstico. */
function extractExpressionBody(source: string, marker: string, fileLabel: string): string {
  const idx = source.indexOf(marker)
  if (idx === -1) throw new Error(`Ni najdenega markerja "${marker}" v ${fileLabel} — datoteka se je verjetno spremenila`)
  const afterMarker = idx + marker.length
  const blankLineMatch = /\r?\n\r?\n/.exec(source.slice(afterMarker))
  if (!blankLineMatch) throw new Error(`Ni najdene prazne vrstice po markerju "${marker}" v ${fileLabel}`)
  return source.slice(afterMarker, afterMarker + blankLineMatch.index)
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

describe('api/import-players.ts <-> src/lib/playerImport — sinhronizacija podvojene kode', () => {
  test('normalizeEmso: telo v api/import-players.ts se ujema s src/lib/playerImport/emso.ts', () => {
    const apiBody = extractBraceBody(
      apiSource, '(value: string | number | null | undefined): string', 'api/import-players.ts',
    )
    const srcBody = extractBraceBody(
      emsoSource, '(value: string | number | null | undefined): string', 'src/lib/playerImport/emso.ts',
    )
    expect(
      normalizeWhitespace(apiBody),
      'Telo normalizeEmso v api/import-players.ts se razlikuje od src/lib/playerImport/emso.ts — posodobi obe kopiji (glej komentar nad kopijo v api/import-players.ts)',
    ).toBe(normalizeWhitespace(srcBody))
  })

  test('normalizeName: telo v api/import-players.ts se ujema s src/lib/playerImport/matchPlayers.ts', () => {
    const apiBody = extractExpressionBody(
      apiSource, '(s: string | null): string =>', 'api/import-players.ts',
    )
    const srcBody = extractExpressionBody(
      matchPlayersSource, '(s: string | null): string =>', 'src/lib/playerImport/matchPlayers.ts',
    )
    expect(
      normalizeWhitespace(apiBody),
      'Telo normalizeName v api/import-players.ts se razlikuje od src/lib/playerImport/matchPlayers.ts — posodobi obe kopiji (glej komentar nad kopijo v api/import-players.ts)',
    ).toBe(normalizeWhitespace(srcBody))
  })

  test('zoziKandidate: telo v api/import-players.ts se ujema s src/lib/playerImport/matchPlayers.ts', () => {
    // Marker je podpis parametrov in je namenoma drugačen od obeh obstoječih —
    // extractBraceBody išče PRVI pojav, zato bi enak podpis primerjal napačen par.
    const marker = 'kandidati: T[], emsoSuffix: string | null, sportnaSt: string | null,'
    const apiBody = extractBraceBody(apiSource, marker, 'api/import-players.ts')
    const srcBody = extractBraceBody(matchPlayersSource, marker, 'src/lib/playerImport/matchPlayers.ts')
    expect(
      normalizeWhitespace(apiBody),
      'Telo zoziKandidate v api/import-players.ts se razlikuje od src/lib/playerImport/matchPlayers.ts — posodobi obe kopiji (glej komentar nad kopijo v api/import-players.ts)',
    ).toBe(normalizeWhitespace(srcBody))
  })

  test('emsoNasprotuje: telo v api/import-players.ts se ujema s src/lib/playerImport/matchPlayers.ts', () => {
    const marker = '(obstojeci: string | null, uvozeni: string | null): boolean'
    const apiBody = extractBraceBody(apiSource, marker, 'api/import-players.ts')
    const srcBody = extractBraceBody(matchPlayersSource, marker, 'src/lib/playerImport/matchPlayers.ts')
    expect(
      normalizeWhitespace(apiBody),
      'Telo emsoNasprotuje v api/import-players.ts se razlikuje od src/lib/playerImport/matchPlayers.ts — posodobi obe kopiji (glej komentar nad kopijo v api/import-players.ts)',
    ).toBe(normalizeWhitespace(srcBody))
  })

  test('nobena datoteka v api/ ne uvaža vrednosti iz src/ (dovoljen je samo `import type`)', () => {
    // Velja za CELOTEN imenik api/, ne le za import-players.ts: vsaka nova
    // strežniška datoteka lahko na enak način podre produkcijo.
    const apiDir = path.resolve(here, '../../../api')
    const kršitve: string[] = []
    for (const ime of readdirSync(apiDir).filter((f: string) => f.endsWith('.ts'))) {
      const vsebina = readFileSync(path.join(apiDir, ime), 'utf8')
      for (const line of vsebina.split('\n')) {
        if (/from ['"]\.\.\/src/.test(line) && !/^\s*import type/.test(line)) {
          kršitve.push(`${ime}: ${line.trim()}`)
        }
      }
    }
    expect(
      kršitve,
      `Najden value-import iz src/ v api/ (Vercel zapakira le api/, to bo padlo z ERR_MODULE_NOT_FOUND): ${kršitve.join('; ')}`,
    ).toEqual([])
  })
})

/**
 * Reg. št. območne zveze in športna številka nista isto.
 *
 * 29. 8. 2026 sta bili zliti v `license_number`, ker se razpona ujemata.
 * Posledica: dve različni osebi iz različnih klubov sta dobili isto številko
 * (3472 — Tonejc/Mengeš in Matović/Tivoli; 3473 — Kandare/Mengeš in
 * Pavlić/Tivoli). Gre za ločeni zaporedji, ki se prekrivata.
 *
 * Ta test drži narazen dvoje, kar je enkrat že zdrsnilo skupaj.
 */
describe('obz_reg_number ostane ločen od license_number', () => {
  test('uvoz piše regNumber v obz_reg_number', () => {
    expect(apiSource).toMatch(/\['obz_reg_number',\s*p\.regNumber\]/)
  })

  test('uvoz piše sportNumber v license_number, ne regNumber', () => {
    expect(apiSource).toMatch(/\['license_number',\s*p\.sportNumber\]/)
    expect(apiSource).not.toMatch(/\['license_number',\s*p\.regNumber\]/)
  })

  test('regNumber se NE uporablja za ujemanje igralcev', () => {
    // Ista Reg. št. lahko pripada dvema osebama, zato kot razlikovalec ne sme
    // nastopati — sicer bi uvoz posodobil napačen zapis.
    const ujemanje = apiSource.slice(apiSource.indexOf('matchByNameAndBirthYear('))
    const klic = ujemanje.slice(0, ujemanje.indexOf(')') + 1)
    expect(klic).not.toContain('regNumber')
  })
})
