import * as XLSX from 'xlsx'
import type { ClubHeader, ParsedPlayer, ParseResult } from './types'
import { parseBirthDate } from './parseDate'
import { normalizeEmso } from './emso'

// Prebere obrazec "Evidenca in registracija igralcev po klubih" (matrika vrstic -> ParseResult).

function cellText(row: unknown[] | undefined, idx: number): string {
  if (!row) return ''
  const v = row[idx]
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function firstNonEmptyAfter(row: unknown[], fromIdx: number): string {
  for (let i = fromIdx + 1; i < row.length; i++) {
    const v = cellText(row, i)
    if (v !== '') return v
  }
  return ''
}

function parseHeader(rows: unknown[][]): ClubHeader {
  const club: ClubHeader = {
    name: '',
    season: null,
    regId: null,
    taxId: null,
    mailAddress: null,
    contactName: null,
    phone: null,
    email: null,
  }

  for (const row of rows) {
    if (!row || row.length === 0) continue
    const label = cellText(row, 0).toLowerCase()

    if (club.season === null) {
      const m = cellText(row, 0).match(/sezono\s+(\d{4}\/\d{2})/i)
      if (m) club.season = m[1]
    }

    if (label.startsWith('balinarski klub')) {
      club.name = firstNonEmptyAfter(row, 0)
    } else if (label.startsWith('matična')) {
      club.regId = firstNonEmptyAfter(row, 0) || null
    } else if (label.startsWith('davčna')) {
      club.taxId = firstNonEmptyAfter(row, 0) || null
    } else if (label.startsWith('naslov za pošto')) {
      club.mailAddress = firstNonEmptyAfter(row, 0) || null
    } else if (label.startsWith('kontaktna oseba')) {
      club.contactName = firstNonEmptyAfter(row, 0) || null
    } else if (label.startsWith('telefon')) {
      club.phone = firstNonEmptyAfter(row, 0) || null
    } else if (label.startsWith('elektronski naslov')) {
      club.email = firstNonEmptyAfter(row, 0) || null
    }
  }

  if (!club.name) {
    throw new Error('V glavi ni najden "Balinarski klub".')
  }

  return club
}

function findTableHeaderIndex(rows: unknown[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    const lower = row.map((c) => String(c ?? '').toLowerCase().trim())
    if (lower.includes('emšo') && lower.includes('priimek') && lower.includes('ime')) {
      return i
    }
  }
  return -1
}

interface ColumnIndexes {
  ime: number
  priimek: number
  spol: number
  datum: number
  emso: number
  sportnaSt: number
  drzava: number
  drzavljanstvo: number
  ulica: number
  hisna: number
  postna: number
  birthCity: number
  addressCity: number
}

function findColumnIndexes(headerRow: unknown[]): ColumnIndexes {
  const lower = headerRow.map((c) => String(c ?? '').toLowerCase().trim())

  const indexOfLabel = (label: string): number => lower.indexOf(label)

  const ime = indexOfLabel('ime')
  const priimek = indexOfLabel('priimek')
  const spol = indexOfLabel('spol')
  const datum = indexOfLabel('datum')
  const emso = indexOfLabel('emšo')
  const sportnaSt = indexOfLabel('športna št.')
  const drzava = indexOfLabel('država')
  const drzavljanstvo = indexOfLabel('državljanstvo')
  const ulica = indexOfLabel('ulica')
  const hisna = indexOfLabel('hišna')
  const postna = indexOfLabel('poštna')

  // 'kraj' se pojavi dvakrat: rojstni kraj (po EMŠO, pred Ulica) in bivališče (po Poštna)
  const krajIndexes: number[] = []
  lower.forEach((v, i) => {
    if (v === 'kraj') krajIndexes.push(i)
  })

  let birthCity = krajIndexes.find((i) => i > emso && (ulica < 0 || i < ulica))
  if (birthCity === undefined) birthCity = emso >= 0 ? emso + 1 : -1

  let addressCity = krajIndexes.find((i) => i > postna)
  if (addressCity === undefined) addressCity = postna >= 0 ? postna + 1 : -1

  return {
    ime,
    priimek,
    spol,
    datum,
    emso,
    sportnaSt,
    drzava,
    drzavljanstvo,
    ulica,
    hisna,
    postna,
    birthCity,
    addressCity,
  }
}

const STOP_PATTERN = /vodje ekipe|osnovna in rezervna|izjava|varstvu osebnih/i

function toNullable(s: string): string | null {
  return s === '' ? null : s
}

export function parseRegistrationRows(rows: unknown[][]): ParseResult {
  const club = parseHeader(rows)

  const headerIdx = findTableHeaderIndex(rows)
  if (headerIdx < 0) {
    throw new Error('V datoteki ni najdena tabela z glavo (Klub, Ime, Priimek, EMŠO, ...).')
  }

  const cols = findColumnIndexes(rows[headerIdx])

  const players: ParsedPlayer[] = []
  const warnings: string[] = []

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length === 0) continue

    const firstCell = cellText(row, 0)
    const imeCell = cellText(row, cols.ime)

    if (STOP_PATTERN.test(firstCell) || STOP_PATTERN.test(imeCell)) {
      break
    }

    const firstName = cellText(row, cols.ime)
    const lastName = cellText(row, cols.priimek)

    if (!firstName && !lastName) continue
    if (!lastName) continue

    const genderRaw = cellText(row, cols.spol).toUpperCase()
    const gender = genderRaw === 'M' ? 'M' : genderRaw === 'Ž' || genderRaw === 'Z' ? 'Ž' : null

    const datumRaw = row[cols.datum]
    const birthDate = parseBirthDate(
      typeof datumRaw === 'number' || typeof datumRaw === 'string' ? datumRaw : null
    )

    const emsoRaw = cellText(row, cols.emso)
    const emso = emsoRaw ? normalizeEmso(emsoRaw) || null : null

    const fullName = `${firstName} ${lastName}`.replace(/\s+/g, ' ').trim()

    const player: ParsedPlayer = {
      firstName,
      lastName,
      fullName,
      gender,
      birthDate,
      emso,
      birthCity: toNullable(cellText(row, cols.birthCity)),
      birthCountry: toNullable(cellText(row, cols.drzava)),
      citizenship: toNullable(cellText(row, cols.drzavljanstvo)),
      addressStreet: toNullable(cellText(row, cols.ulica)),
      addressHouse: toNullable(cellText(row, cols.hisna)),
      addressPostal: toNullable(cellText(row, cols.postna)),
      addressCity: toNullable(cellText(row, cols.addressCity)),
      sportNumber: toNullable(cellText(row, cols.sportnaSt)),
      rowIndex: i,
    }

    players.push(player)
  }

  if (players.length === 0) {
    warnings.push('V tabeli ni najden noben igralec.')
  }

  return { club, players, warnings }
}

// Ovojnica: File → prvi list → matrika vrstic → parseRegistrationRows
export async function parseRegistrationFile(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
  return parseRegistrationRows(rows)
}
