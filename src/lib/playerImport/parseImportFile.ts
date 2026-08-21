/**
 * Ena vstopna točka za obe obliki uvoza igralcev.
 *
 * Datoteko prebere ENKRAT v matriko vrstic, prepozna obliko in jo preda
 * ustreznemu čistemu razčlenjevalniku:
 *
 *   - registracijski obrazec BZS  → parseRegistrationRows  (glava s klubom, en klub)
 *   - izvoz iz evidence.balinanje.si → parseEvidenceRows    (ravna tabela, lahko več klubov)
 *
 * Zakaj prepoznava tu in ne globlje: parseRegistrationRows kot prvo dejanje
 * prebere glavo kluba in ob njeni odsotnosti vrže 'V glavi ni najden "Balinarski
 * klub".'. Sporočilo se adminu izpiše dobesedno, zato bi bila vsaka datoteka
 * druge oblike videti kot pokvarjen registracijski obrazec. Prepoznava mora
 * teči pred tem.
 *
 * `xlsx` se naloži dinamično iz istega razloga kot doslej: knjižnica meri 7 MB
 * in ne sme v glavni sveženj, ki ga naloži vsak obiskovalec lestvice.
 * Razčlenjevalniki sami so čisti in xlsx ne uvažajo.
 */

import type { ParseResult } from './types'
import { parseRegistrationRows } from './parseRegistrationXlsx'
import { parseEvidenceRows, jeEvidencniIzvoz } from './parseEvidenceXlsx'

/**
 * Prepozna obliko in razčleni. Vrstni red preverjanja ni poljuben: izvoz iz
 * evidence se prepozna POZITIVNO (značilna glava in odsotnost glave kluba),
 * vse ostalo gre v registracijski obrazec, ki ima svoja, dobro pokrita pravila.
 * Obratna razporeditev bi pomenila, da ohlapna hevristika požre tudi obrazce.
 */
export function parseImportRows(rows: unknown[][]): ParseResult {
  if (jeEvidencniIzvoz(rows)) return parseEvidenceRows(rows)
  const rezultat = parseRegistrationRows(rows)
  return { ...rezultat, format: 'bzs' }
}

/** Ovojnica z I/O: File → prvi list → matrika vrstic → parseImportRows. */
export async function parseImportFile(file: File): Promise<ParseResult> {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
  return parseImportRows(rows)
}
