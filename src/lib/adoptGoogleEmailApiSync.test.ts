import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Varuje pred razkorakom med api/adopt-google-email.ts (ki NE sme uvažati iz src/,
// ker Vercel zapakira le api/) in izvirnikom v src/lib/googleEmailAdoption.ts.

const here = path.dirname(fileURLToPath(import.meta.url))
const apiSource = readFileSync(path.resolve(here, '../../api/adopt-google-email.ts'), 'utf8')
const srcSource = readFileSync(path.resolve(here, './googleEmailAdoption.ts'), 'utf8')

const MARKER = '(identities: IdentityLike[], currentEmail: string): AdoptionResult'

function extractBraceBody(source: string, marker: string, label: string): string {
  const idx = source.indexOf(marker)
  if (idx === -1) throw new Error(`Ni najdenega markerja "${marker}" v ${label}`)
  const start = source.indexOf('{', idx)
  let depth = 0
  let i = start
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') { depth--; if (depth === 0) break }
  }
  if (depth !== 0) throw new Error(`Nezaključen blok v ${label}`)
  return source.slice(start + 1, i)
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

describe('api/adopt-google-email.ts <-> src/lib/googleEmailAdoption.ts', () => {
  test('telo chooseGoogleEmail se ujema v obeh kopijah', () => {
    expect(
      norm(extractBraceBody(apiSource, MARKER, 'api/adopt-google-email.ts')),
      'Kopiji chooseGoogleEmail se razlikujeta — posodobi obe',
    ).toBe(norm(extractBraceBody(srcSource, MARKER, 'src/lib/googleEmailAdoption.ts')))
  })

  test('api/adopt-google-email.ts ne uvaza vrednosti iz src/', () => {
    const slabi = apiSource.split('\n')
      .filter(l => /from ['"]\.\.\/src/.test(l) && !/^\s*import type/.test(l))
    expect(slabi, `Value-import iz src/ bo padel z ERR_MODULE_NOT_FOUND: ${slabi.join('; ')}`).toEqual([])
  })
})
