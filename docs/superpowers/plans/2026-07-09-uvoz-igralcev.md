# Uvoz igralcev iz BZS Excela — načrt izvedbe

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin naloži uradni BZS registracijski Excel kluba → aplikacija ustvari/posodobi igralce, jih poveže s klubom (posodobi /klubi) in doda v izbrano ligaško ekipo; posamezen igralec se med sezono doda prek ročnega obrazca.

**Architecture:** Čista logika parsiranja/ujemanja v `src/lib/playerImport/` (unit-testirana z vitest). Strežniško pisanje (ustvarjanje računov s service-role) v Vercel serverless funkciji `/api/import-players`. Admin stran `src/pages/admin/PlayerImport.tsx` parsira Excel v brskalniku, pokaže predogled in kliče API.

**Tech Stack:** React + TypeScript + Vite, Supabase (Postgres + Auth), `xlsx` (že v projektu), Vercel serverless funkcije (`@vercel/node`), vitest.

**Spec:** `docs/superpowers/specs/2026-07-09-uvoz-igralcev-design.md`

---

## Datotečna struktura

**Ustvari:**
- `supabase/migrations/2026-07-09_add_address_city.sql` — nov stolpec `users.address_city`
- `src/lib/playerImport/types.ts` — skupni tipi
- `src/lib/playerImport/emso.ts` (+ `.test.ts`) — validacija EMŠO
- `src/lib/playerImport/parseDate.ts` (+ `.test.ts`) — datum rojstva (Excel serijsko + besedilo)
- `src/lib/playerImport/parseRegistrationXlsx.ts` (+ `.test.ts`) — parser obrazca
- `src/lib/playerImport/matchPlayers.ts` (+ `.test.ts`) — statusi (nov/posodobi/prestop/napaka)
- `api/import-players.ts` — Vercel serverless funkcija (service-role pisanje)
- `src/pages/admin/PlayerImport.tsx` — admin stran (upload, predogled, potrditev, ročni obrazec)

**Spremeni:**
- `vercel.json` — izključi `/api/*` iz SPA rewrite
- `package.json` — dodaj `@vercel/node` (devDep)
- `src/App.tsx` — nova zaščitena admin pot
- `src/pages/admin/AdminDashboard.tsx` — kartica za novo stran

**Ročni koraki (izven kode):** v Vercel projektu dodaj okoljski spremenljivki `SUPABASE_URL` in `SUPABASE_SERVICE_ROLE_KEY` (Production+Preview). Označeno v Tasku 7.

---

## Task 1: Setup — migracija, vercel.json, odvisnost

**Files:**
- Create: `supabase/migrations/2026-07-09_add_address_city.sql`
- Modify: `vercel.json`
- Modify: `package.json` (prek npm)

- [ ] **Step 1: Migracija za `address_city`**

Ustvari `supabase/migrations/2026-07-09_add_address_city.sql`:

```sql
-- Bivališče: kraj (Excel "Kraj" v naslovu). users že ima address_street/house/postal/country.
alter table public.users add column if not exists address_city text;
```

- [ ] **Step 2: Uveljavi migracijo na Supabase**

Poženi SQL iz Step 1 v Supabase (SQL Editor ali prek Supabase MCP `apply_migration`). Preveri:

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='users' and column_name='address_city';
```
Expected: vrne eno vrstico `address_city`.

- [ ] **Step 3: Izključi /api iz SPA rewrite**

Zamenjaj vsebino `vercel.json`:

```json
{
  "rewrites": [
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

- [ ] **Step 4: Dodaj @vercel/node za tipe serverless funkcije**

Run: `npm install -D @vercel/node`
Expected: doda se v `devDependencies`, brez napak.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026-07-09_add_address_city.sql vercel.json package.json package-lock.json
git commit -m "chore(uvoz): migracija address_city + vercel /api rewrite + @vercel/node"
```

---

## Task 2: Skupni tipi

**Files:**
- Create: `src/lib/playerImport/types.ts`

- [ ] **Step 1: Napiši tipe**

Ustvari `src/lib/playerImport/types.ts`:

```typescript
export type Gender = 'M' | 'Ž'

export interface ParsedPlayer {
  firstName: string
  lastName: string
  fullName: string
  gender: Gender | null
  birthDate: string | null      // YYYY-MM-DD
  emso: string | null           // 13 števk ali null
  birthCity: string | null
  birthCountry: string | null
  citizenship: string | null
  addressStreet: string | null
  addressHouse: string | null
  addressPostal: string | null
  addressCity: string | null
  sportNumber: string | null
  rowIndex: number              // vrstica v Excelu (za sporočila)
}

export interface ClubHeader {
  name: string
  season: string | null         // npr. "2025/26"
  regId: string | null          // matična št.
  taxId: string | null          // davčna št.
  mailAddress: string | null
  contactName: string | null
  phone: string | null
  email: string | null
}

export interface ParseResult {
  club: ClubHeader
  players: ParsedPlayer[]
  warnings: string[]
}

export type MatchStatus = 'new' | 'update' | 'transfer' | 'error'

export interface ExistingUser {
  id: string
  full_name: string | null
  emso: string | null
  club_id: string | null
  date_of_birth: string | null
}

export interface ImportRow {
  player: ParsedPlayer
  status: MatchStatus
  existingUserId: string | null
  currentClubId: string | null
  error: string | null
}

export interface ImportTarget {
  seasonId: string
  teamId: string | null         // obstoječa ekipa
  newTeamClubName: string | null // če ustvarjamo novo ekipo
}

export interface ImportRequest {
  club: ClubHeader
  target: ImportTarget
  players: ParsedPlayer[]
}

export interface ImportReport {
  clubCreated: boolean
  teamCreated: boolean
  created: number
  updated: number
  transferred: number
  addedToTeam: number
  skipped: { player: string; reason: string }[]
}
```

- [ ] **Step 2: Preveri prevajanje**

Run: `npx tsc --noEmit`
Expected: brez napak (nova datoteka se prevede).

- [ ] **Step 3: Commit**

```bash
git add src/lib/playerImport/types.ts
git commit -m "feat(uvoz): skupni tipi za uvoz igralcev"
```

---

## Task 3: Validacija EMŠO

**Files:**
- Create: `src/lib/playerImport/emso.ts`
- Test: `src/lib/playerImport/emso.test.ts`

- [ ] **Step 1: Napiši padajoči test**

Ustvari `src/lib/playerImport/emso.test.ts`:

```typescript
import { describe, test, expect } from 'vitest'
import { isValidEmso, normalizeEmso } from './emso'

describe('normalizeEmso', () => {
  test('število v niz z vodilnimi ničlami do 13 mest', () => {
    expect(normalizeEmso(1106991500061)).toBe('1106991500061')
  })
  test('odstrani presledke in ne-števke', () => {
    expect(normalizeEmso(' 1206005500150 ')).toBe('1206005500150')
  })
  test('prazno → prazen niz', () => {
    expect(normalizeEmso('')).toBe('')
    expect(normalizeEmso(null as unknown as string)).toBe('')
  })
})

describe('isValidEmso', () => {
  test('veljaven EMŠO (pravilna kontrolna števka)', () => {
    // 1206005500150: kontrolna števka preverjena po standardnem algoritmu
    expect(isValidEmso('1206005500150')).toBe(true)
    expect(isValidEmso('1710950500442')).toBe(true)
  })
  test('napačna dolžina → neveljaven', () => {
    expect(isValidEmso('12345')).toBe(false)
    expect(isValidEmso('12060055001509')).toBe(false)
  })
  test('napačna kontrolna števka → neveljaven', () => {
    expect(isValidEmso('1206005500151')).toBe(false)
  })
  test('neštevilski znaki → neveljaven', () => {
    expect(isValidEmso('12060055001AB')).toBe(false)
  })
})
```

- [ ] **Step 2: Poženi test — mora pasti**

Run: `npx vitest run src/lib/playerImport/emso.test.ts`
Expected: FAIL ("Cannot find module './emso'").

- [ ] **Step 3: Napiši implementacijo**

Ustvari `src/lib/playerImport/emso.ts`:

```typescript
// EMŠO: 13 števk DDMMYYYRRBBBK, K = kontrolna števka po standardnem algoritmu.
export function normalizeEmso(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\D/g, '')
}

export function isValidEmso(value: string | number | null | undefined): boolean {
  const s = normalizeEmso(value)
  if (s.length !== 13) return false
  const weights = [7, 6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(s[i]) * weights[i]
  const mod = sum % 11
  const check = mod === 0 ? 0 : 11 - mod
  if (check === 10) return false // neveljaven EMŠO po standardu
  return check === Number(s[12])
}
```

- [ ] **Step 4: Poženi test — mora uspeti**

Run: `npx vitest run src/lib/playerImport/emso.test.ts`
Expected: PASS (vsi testi).

- [ ] **Step 5: Commit**

```bash
git add src/lib/playerImport/emso.ts src/lib/playerImport/emso.test.ts
git commit -m "feat(uvoz): validacija EMŠO s kontrolno števko"
```

---

## Task 4: Parser datuma rojstva

**Files:**
- Create: `src/lib/playerImport/parseDate.ts`
- Test: `src/lib/playerImport/parseDate.test.ts`

- [ ] **Step 1: Napiši padajoči test**

Ustvari `src/lib/playerImport/parseDate.test.ts`:

```typescript
import { describe, test, expect } from 'vitest'
import { parseBirthDate } from './parseDate'

describe('parseBirthDate', () => {
  test('Excel serijska številka → YYYY-MM-DD', () => {
    // 38515 = 2005-06-12 (Excel epoha 1899-12-30)
    expect(parseBirthDate(38515)).toBe('2005-06-12')
    // 23621 = 1964-09-01
    expect(parseBirthDate(23621)).toBe('1964-09-01')
  })
  test('besedilo d.m.yyyy → YYYY-MM-DD', () => {
    expect(parseBirthDate('6.5.2010')).toBe('2010-05-06')
    expect(parseBirthDate('2.02.1962')).toBe('1962-02-02')
    expect(parseBirthDate('14.09.1962')).toBe('1962-09-14')
  })
  test('že v ISO obliki → nespremenjeno', () => {
    expect(parseBirthDate('1962-02-02')).toBe('1962-02-02')
  })
  test('prazno/neveljavno → null', () => {
    expect(parseBirthDate('')).toBeNull()
    expect(parseBirthDate(null)).toBeNull()
    expect(parseBirthDate('nekaj')).toBeNull()
  })
})
```

- [ ] **Step 2: Poženi test — mora pasti**

Run: `npx vitest run src/lib/playerImport/parseDate.test.ts`
Expected: FAIL ("Cannot find module './parseDate'").

- [ ] **Step 3: Napiši implementacijo**

Ustvari `src/lib/playerImport/parseDate.ts`:

```typescript
// Vrne YYYY-MM-DD ali null. Podpira Excel serijsko številko in besedilo d.m.yyyy / ISO.
function pad(n: number): string { return String(n).padStart(2, '0') }

export function parseBirthDate(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null

  // Excel serijska številka (dni od 1899-12-30)
  if (typeof value === 'number' || /^\d+$/.test(String(value).trim())) {
    const serial = Number(value)
    if (serial > 0 && serial < 60000) {
      const ms = Date.UTC(1899, 11, 30) + serial * 86400000
      const d = new Date(ms)
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    }
  }

  const s = String(value).trim()

  // Že ISO?
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return s

  // d.m.yyyy (dan.mesec.leto), možni vodilni presledki/ničle
  const dmy = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/)
  if (dmy) {
    const day = Number(dmy[1]), month = Number(dmy[2]), year = Number(dmy[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad(month)}-${pad(day)}`
    }
  }

  return null
}
```

- [ ] **Step 4: Poženi test — mora uspeti**

Run: `npx vitest run src/lib/playerImport/parseDate.test.ts`
Expected: PASS.

> Opomba: če katera od pričakovanih serijskih vrednosti (38515/23621) ne ustreza, popravi PRIČAKOVANO vrednost v testu po pravilni Excel pretvorbi (epoha 1899-12-30), ne implementacije.

- [ ] **Step 5: Commit**

```bash
git add src/lib/playerImport/parseDate.ts src/lib/playerImport/parseDate.test.ts
git commit -m "feat(uvoz): parser datuma rojstva (Excel serijsko + besedilo)"
```

---

## Task 5: Parser registracijskega obrazca

**Files:**
- Create: `src/lib/playerImport/parseRegistrationXlsx.ts`
- Test: `src/lib/playerImport/parseRegistrationXlsx.test.ts`

- [ ] **Step 1: Napiši padajoči test**

Ustvari `src/lib/playerImport/parseRegistrationXlsx.test.ts`:

```typescript
import { describe, test, expect } from 'vitest'
import { parseRegistrationRows } from './parseRegistrationXlsx'

// Poenostavljene vrstice, ki posnemajo strukturo Begunje.xlsx
const rows: unknown[][] = [
  ['EVIDENCA IN REGISTRACIJA IGRALCEV PO KLUBIH ZA SEZONO 2025/26'],
  [],
  ['Območna balinarska zveza:', '', 'NOBZ'],
  ['Balinarski klub:', '', 'BK BEGUNJE'],
  ['Matična št.:', '', 5228450000],
  ['Davčna št.:', '', 43122043],
  ['Naslov za pošto:', '', 'BEGUNJE 46'],
  ['Kontaktna oseba:', '', 'ANTON KLUČAR'],
  ['Telefon:', '', '031 540 491'],
  ['Elektronski naslov kluba:', '', 'bk.begunje@gmail.com'],
  ['Predsednik kluba:', '', 'ANTON KLUČAR'],
  [],
  ['Klub', 'Ime', '', 'Priimek', 'Športna št.', 'Spol', 'Datum', 'EMŠO', 'Kraj ', 'Država', 'Državljanstvo', 'Ulica', 'Hišna', 'Poštna', 'Kraj ', 'E-', 'Podpis'],
  ['', '', '', '', 'neobvezno', '', 'rojstva', '', 'rojstva', 'rojstva', '', '', 'številka', 'številka', '', 'Antidoping', ''],
  ['BK BEGUNJUE', 'NIK ', '', 'GRUDEN HITI', '', 'M', 38515, '1206005500150', 'POSTOJNA', 'SLO', 'SLO', 'POPKOVA', 6, 1380, 'CERKNICA', '', ''],
  ['BK BEGUNJUE', 'ALJAŽ', '', 'MATKO', '', 'M', '6.5.2010', '0605010500353', 'POSTOJNA', 'SLO', 'SLO', 'BEGUNJE', 12, 1382, 'BEGUNJE', '', ''],
  [],
  ['Vodje ekipe na tekmah državnih lig in državnih prvenstev:'],
]

describe('parseRegistrationRows', () => {
  const result = parseRegistrationRows(rows)

  test('prebere klub in sezono iz glave', () => {
    expect(result.club.name).toBe('BK BEGUNJE')
    expect(result.club.season).toBe('2025/26')
    expect(result.club.email).toBe('bk.begunje@gmail.com')
  })

  test('prebere 2 igralca (ustavi pri "Vodje ekipe")', () => {
    expect(result.players).toHaveLength(2)
  })

  test('sestavi full_name, spol, datum (serijsko in besedilo)', () => {
    const nik = result.players[0]
    expect(nik.fullName).toBe('NIK GRUDEN HITI')
    expect(nik.gender).toBe('M')
    expect(nik.birthDate).toBe('2005-06-12')
    expect(nik.emso).toBe('1206005500150')
    expect(nik.birthCity).toBe('POSTOJNA')
    expect(nik.addressStreet).toBe('POPKOVA')
    expect(nik.addressHouse).toBe('6')
    expect(nik.addressPostal).toBe('1380')
    expect(nik.addressCity).toBe('CERKNICA')

    const aljaz = result.players[1]
    expect(aljaz.birthDate).toBe('2010-05-06')
    expect(aljaz.fullName).toBe('ALJAŽ MATKO')
  })

  test('napaka če manjka klub v glavi', () => {
    expect(() => parseRegistrationRows([['nekaj'], ['Klub', 'Ime']]))
      .toThrow(/Balinarski klub/i)
  })
})
```

- [ ] **Step 2: Poženi test — mora pasti**

Run: `npx vitest run src/lib/playerImport/parseRegistrationXlsx.test.ts`
Expected: FAIL ("Cannot find module './parseRegistrationXlsx'").

- [ ] **Step 3: Napiši implementacijo**

Ustvari `src/lib/playerImport/parseRegistrationXlsx.ts`:

```typescript
import type { ParseResult, ParsedPlayer, ClubHeader } from './types'
import { parseBirthDate } from './parseDate'
import { normalizeEmso } from './emso'

const cell = (row: unknown[] | undefined, i: number): string => {
  if (!row || row[i] === null || row[i] === undefined) return ''
  return String(row[i]).trim()
}

// Prva ne-prazna celica v vrstici desno od podanega indeksa
const valueAfterLabel = (row: unknown[], fromIdx: number): string => {
  for (let i = fromIdx + 1; i < row.length; i++) {
    const v = cell(row, i)
    if (v) return v
  }
  return ''
}

const FOOTER_RE = /vodje ekipe|osnovna in rezervna|izjava|varstvu osebnih/i

function findHeaderRowIndex(rows: unknown[][]): number {
  for (let r = 0; r < rows.length; r++) {
    const cells = (rows[r] || []).map((_, i) => cell(rows[r], i).toLowerCase())
    if (cells.includes('emšo') && cells.includes('priimek') && cells.includes('ime')) return r
  }
  return -1
}

export function parseRegistrationRows(rows: unknown[][]): ParseResult {
  const warnings: string[] = []

  // --- Glava ---
  const club: ClubHeader = {
    name: '', season: null, regId: null, taxId: null,
    mailAddress: null, contactName: null, phone: null, email: null,
  }
  for (const row of rows) {
    for (let i = 0; i < (row?.length ?? 0); i++) {
      const label = cell(row, i).toLowerCase()
      if (label.startsWith('balinarski klub')) club.name = valueAfterLabel(row, i)
      else if (label.startsWith('matična')) club.regId = valueAfterLabel(row, i)
      else if (label.startsWith('davčna')) club.taxId = valueAfterLabel(row, i)
      else if (label.startsWith('naslov za pošto')) club.mailAddress = valueAfterLabel(row, i)
      else if (label.startsWith('kontaktna oseba')) club.contactName = valueAfterLabel(row, i)
      else if (label.startsWith('telefon')) club.phone = valueAfterLabel(row, i)
      else if (label.startsWith('elektronski naslov')) club.email = valueAfterLabel(row, i)
    }
    const titleCell = cell(row, 0)
    const m = titleCell.match(/sezono\s+(\d{4}\/\d{2})/i)
    if (m) club.season = m[1]
  }
  if (!club.name) throw new Error('V glavi ni najden "Balinarski klub".')

  // --- Stolpci tabele ---
  const hdrIdx = findHeaderRowIndex(rows)
  if (hdrIdx === -1) throw new Error('Ni najdena glava tabele (Ime/Priimek/EMŠO).')
  const hdr = rows[hdrIdx]
  const colOf = (label: string): number =>
    hdr.findIndex((_, i) => cell(hdr, i).toLowerCase() === label.toLowerCase())

  const cIme = colOf('ime'), cPriimek = colOf('priimek'), cSpol = colOf('spol')
  const cDatum = colOf('datum'), cEmso = colOf('emšo')
  const cSport = colOf('športna št.')
  const cDrzava = colOf('država'), cDrzavljanstvo = colOf('državljanstvo')
  const cUlica = colOf('ulica'), cHisna = colOf('hišna'), cPostna = colOf('poštna')
  // "Kraj " se pojavi 2x: rojstni (za EMŠO) in bivališče (za Poštna)
  const krajIdxs = hdr.map((_, i) => (cell(hdr, i).toLowerCase() === 'kraj' ? i : -1)).filter(i => i >= 0)
  const cKrajRojstvo = krajIdxs.find(i => i > cEmso && i < cUlica) ?? cEmso + 1
  const cKrajBivalisce = krajIdxs.find(i => i > cPostna) ?? cPostna + 1

  // --- Igralci ---
  const players: ParsedPlayer[] = []
  for (let r = hdrIdx + 1; r < rows.length; r++) {
    const row = rows[r] || []
    const first = cell(row, cIme), last = cell(row, cPriimek)
    if (cell(row, 0).match(FOOTER_RE) || cell(row, cIme).match(FOOTER_RE)) break
    if (!first && !last) continue // prazna / pod-glava
    // pod-glava (npr. "rojstva","neobvezno") nima EMŠO in nima priimka
    if (!last) continue

    const fullName = `${first} ${last}`.replace(/\s+/g, ' ').trim()
    const emsoRaw = normalizeEmso(row[cEmso] as string)
    players.push({
      firstName: first, lastName: last, fullName,
      gender: (cell(row, cSpol).toUpperCase() === 'Ž' ? 'Ž' : cell(row, cSpol).toUpperCase() === 'M' ? 'M' : null),
      birthDate: parseBirthDate(row[cDatum] as string | number),
      emso: emsoRaw.length ? emsoRaw : null,
      birthCity: cell(row, cKrajRojstvo) || null,
      birthCountry: cDrzava >= 0 ? (cell(row, cDrzava) || null) : null,
      citizenship: cDrzavljanstvo >= 0 ? (cell(row, cDrzavljanstvo) || null) : null,
      addressStreet: cUlica >= 0 ? (cell(row, cUlica) || null) : null,
      addressHouse: cHisna >= 0 ? (cell(row, cHisna) || null) : null,
      addressPostal: cPostna >= 0 ? (cell(row, cPostna) || null) : null,
      addressCity: cell(row, cKrajBivalisce) || null,
      sportNumber: cSport >= 0 ? (cell(row, cSport) || null) : null,
      rowIndex: r,
    })
  }
  if (!players.length) warnings.push('V tabeli ni najden noben igralec.')

  return { club, players, warnings }
}
```

- [ ] **Step 4: Poženi test — mora uspeti**

Run: `npx vitest run src/lib/playerImport/parseRegistrationXlsx.test.ts`
Expected: PASS.

- [ ] **Step 5: Dodaj tanko ovojnico za branje datoteke (brez testa — I/O)**

Dodaj na konec `src/lib/playerImport/parseRegistrationXlsx.ts`:

```typescript
import * as XLSX from 'xlsx'

// Ovojnica: File → prvi list → matrika vrstic → parseRegistrationRows
export async function parseRegistrationFile(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
  return parseRegistrationRows(rows)
}
```

- [ ] **Step 6: Preveri prevajanje + celoten test parserja**

Run: `npx tsc --noEmit && npx vitest run src/lib/playerImport/parseRegistrationXlsx.test.ts`
Expected: brez tsc napak; testi PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/playerImport/parseRegistrationXlsx.ts src/lib/playerImport/parseRegistrationXlsx.test.ts
git commit -m "feat(uvoz): parser BZS registracijskega obrazca"
```

---

## Task 6: Ujemanje igralcev (statusi)

**Files:**
- Create: `src/lib/playerImport/matchPlayers.ts`
- Test: `src/lib/playerImport/matchPlayers.test.ts`

- [ ] **Step 1: Napiši padajoči test**

Ustvari `src/lib/playerImport/matchPlayers.test.ts`:

```typescript
import { describe, test, expect } from 'vitest'
import { computeStatuses } from './matchPlayers'
import type { ParsedPlayer, ExistingUser } from './types'

const mk = (o: Partial<ParsedPlayer>): ParsedPlayer => ({
  firstName: 'X', lastName: 'Y', fullName: 'X Y', gender: 'M', birthDate: '1990-01-01',
  emso: null, birthCity: null, birthCountry: null, citizenship: null,
  addressStreet: null, addressHouse: null, addressPostal: null, addressCity: null,
  sportNumber: null, rowIndex: 0, ...o,
})

const CLUB = 'club-begunje'

describe('computeStatuses', () => {
  test('nov igralec (EMŠO ni v bazi)', () => {
    const rows = computeStatuses([mk({ emso: '1206005500150' })], [], CLUB)
    expect(rows[0].status).toBe('new')
  })

  test('obstoječ v istem klubu → update', () => {
    const existing: ExistingUser[] = [{ id: 'u1', full_name: 'X Y', emso: '1206005500150', club_id: CLUB, date_of_birth: '1990-01-01' }]
    const rows = computeStatuses([mk({ emso: '1206005500150' })], existing, CLUB)
    expect(rows[0].status).toBe('update')
    expect(rows[0].existingUserId).toBe('u1')
  })

  test('obstoječ v drugem klubu → transfer', () => {
    const existing: ExistingUser[] = [{ id: 'u1', full_name: 'X Y', emso: '1206005500150', club_id: 'club-drug', date_of_birth: '1990-01-01' }]
    const rows = computeStatuses([mk({ emso: '1206005500150' })], existing, CLUB)
    expect(rows[0].status).toBe('transfer')
    expect(rows[0].currentClubId).toBe('club-drug')
  })

  test('neveljaven EMŠO → error', () => {
    const rows = computeStatuses([mk({ emso: '123' })], [], CLUB)
    expect(rows[0].status).toBe('error')
    expect(rows[0].error).toMatch(/EMŠO/i)
  })

  test('brez EMŠO, a ujemanje po imenu+datumu → update', () => {
    const existing: ExistingUser[] = [{ id: 'u9', full_name: 'X Y', emso: null, club_id: CLUB, date_of_birth: '1990-01-01' }]
    const rows = computeStatuses([mk({ emso: null })], existing, CLUB)
    expect(rows[0].status).toBe('update')
    expect(rows[0].existingUserId).toBe('u9')
  })

  test('brez EMŠO in brez ujemanja → new', () => {
    const rows = computeStatuses([mk({ emso: null, fullName: 'Nova Oseba', birthDate: '2001-02-03' })], [], CLUB)
    expect(rows[0].status).toBe('new')
  })
})
```

- [ ] **Step 2: Poženi test — mora pasti**

Run: `npx vitest run src/lib/playerImport/matchPlayers.test.ts`
Expected: FAIL ("Cannot find module './matchPlayers'").

- [ ] **Step 3: Napiši implementacijo**

Ustvari `src/lib/playerImport/matchPlayers.ts`:

```typescript
import type { ParsedPlayer, ExistingUser, ImportRow } from './types'
import { isValidEmso } from './emso'

const norm = (s: string | null): string =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/š/g, 's').replace(/ž/g, 'z').replace(/č/g, 'c').replace(/\s+/g, ' ').trim()

export function computeStatuses(
  players: ParsedPlayer[],
  existing: ExistingUser[],
  targetClubId: string,
): ImportRow[] {
  const byEmso = new Map<string, ExistingUser>()
  for (const u of existing) if (u.emso) byEmso.set(u.emso, u)

  return players.map((p): ImportRow => {
    // neveljaven EMŠO (če je podan a napačen)
    if (p.emso && !isValidEmso(p.emso)) {
      return { player: p, status: 'error', existingUserId: null, currentClubId: null, error: 'Neveljaven EMŠO' }
    }

    // ujemanje po EMŠO
    let match: ExistingUser | undefined = p.emso ? byEmso.get(p.emso) : undefined
    // rezerva: ime + datum rojstva
    if (!match && !p.emso) {
      match = existing.find(u => norm(u.full_name) === norm(p.fullName) && u.date_of_birth === p.birthDate)
    }

    if (!match) return { player: p, status: 'new', existingUserId: null, currentClubId: null, error: null }
    if (match.club_id && match.club_id !== targetClubId) {
      return { player: p, status: 'transfer', existingUserId: match.id, currentClubId: match.club_id, error: null }
    }
    return { player: p, status: 'update', existingUserId: match.id, currentClubId: match.club_id, error: null }
  })
}
```

- [ ] **Step 4: Poženi test — mora uspeti**

Run: `npx vitest run src/lib/playerImport/matchPlayers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/playerImport/matchPlayers.ts src/lib/playerImport/matchPlayers.test.ts
git commit -m "feat(uvoz): ujemanje igralcev (nov/posodobi/prestop/napaka)"
```

---

## Task 7: Vercel serverless funkcija `/api/import-players`

**Files:**
- Create: `api/import-players.ts`

> **ROČNI KORAK (pred deployem):** v Vercel projektu (Settings → Environment Variables) dodaj za Production+Preview:
> - `SUPABASE_URL` = enak kot `VITE_SUPABASE_URL`
> - `SUPABASE_SERVICE_ROLE_KEY` = service-role ključ iz Supabase (Settings → API). NIKOLI ne daj v `VITE_` spremenljivko (bila bi izpostavljena v brskalniku).

- [ ] **Step 1: Napiši funkcijo**

Ustvari `api/import-players.ts`:

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import type { ImportRequest, ImportReport } from '../src/lib/playerImport/types'

const URL = process.env.SUPABASE_URL as string
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!URL || !SERVICE_KEY) return res.status(500).json({ error: 'Manjkata SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' })

  const admin = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

  // --- Avtorizacija: klicatelj mora biti admin ---
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Manjka avtorizacija' })
  const { data: userData, error: uErr } = await admin.auth.getUser(token)
  if (uErr || !userData.user) return res.status(401).json({ error: 'Neveljavna seja' })
  const { data: me } = await admin.from('users').select('role').eq('id', userData.user.id).single()
  if (!me || !['admin', 'super_admin'].includes(me.role)) return res.status(403).json({ error: 'Ni administrator' })

  const body = req.body as ImportRequest
  if (!body?.club?.name || !body?.target?.seasonId || !Array.isArray(body.players)) {
    return res.status(400).json({ error: 'Napačna vsebina zahteve' })
  }

  const report: ImportReport = { clubCreated: false, teamCreated: false, created: 0, updated: 0, transferred: 0, addedToTeam: 0, skipped: [] }

  try {
    // --- Klub (najdi/ustvari) ---
    let clubId: string
    const { data: existingClub } = await admin.from('clubs').select('id').ilike('name', body.club.name.trim()).maybeSingle()
    if (existingClub) {
      clubId = existingClub.id
    } else {
      const notes = [body.club.regId ? `Matična: ${body.club.regId}` : '', body.club.taxId ? `Davčna: ${body.club.taxId}` : ''].filter(Boolean).join(' · ')
      const { data: newClub, error } = await admin.from('clubs').insert({
        name: body.club.name.trim(), contact_name: body.club.contactName, contact_email: body.club.email,
        contact_phone: body.club.phone, notes: notes || null,
      }).select('id').single()
      if (error) throw new Error(`Klub: ${error.message}`)
      clubId = newClub.id
      report.clubCreated = true
    }

    // --- Ligaška ekipa (najdi/ustvari) ---
    let teamId: string
    if (body.target.teamId) {
      teamId = body.target.teamId
    } else {
      const clubName = (body.target.newTeamClubName || body.club.name).trim()
      const { data: newTeam, error } = await admin.from('league_teams').insert({
        season_id: body.target.seasonId, club_name: clubName,
      }).select('id').single()
      if (error) throw new Error(`Ekipa: ${error.message}`)
      teamId = newTeam.id
      report.teamCreated = true
    }

    // --- Igralci ---
    for (const p of body.players) {
      try {
        // najdi obstoječega po EMŠO
        let userId: string | null = null
        let prevClubId: string | null = null
        if (p.emso) {
          const { data: found } = await admin.from('users').select('id, club_id').eq('emso', p.emso).maybeSingle()
          if (found) { userId = found.id; prevClubId = found.club_id }
        }

        if (!userId) {
          // ustvari račun (trigger ustvari public.users)
          const email = `${p.fullName.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}.${crypto.randomUUID().slice(0, 8)}@balinar.app`
          const { data: created, error: cErr } = await admin.auth.admin.createUser({
            email, password: crypto.randomUUID(), email_confirm: true,
            user_metadata: { full_name: p.fullName },
          })
          if (cErr || !created.user) throw new Error(cErr?.message || 'Napaka pri ustvarjanju računa')
          userId = created.user.id
          report.created++
        } else {
          if (prevClubId && prevClubId !== clubId) report.transferred++
          else report.updated++
        }

        // posodobi profil (club_id vedno; ostalo le če prazno)
        const patch: Record<string, unknown> = { full_name: p.fullName, club_id: clubId, club: body.club.name.trim() }
        const optional: [string, unknown][] = [
          ['gender', p.gender], ['date_of_birth', p.birthDate], ['emso', p.emso],
          ['birth_city', p.birthCity], ['birth_country', p.birthCountry], ['citizenship', p.citizenship],
          ['address_street', p.addressStreet], ['address_house', p.addressHouse],
          ['address_postal', p.addressPostal], ['address_city', p.addressCity],
        ]
        for (const [k, v] of optional) if (v !== null && v !== undefined && v !== '') patch[k] = v
        const { error: upErr } = await admin.from('users').update(patch).eq('id', userId)
        if (upErr) throw new Error(`Profil: ${upErr.message}`)

        // dodaj v ekipo (če še ni)
        const { data: onTeam } = await admin.from('league_team_players')
          .select('id').eq('league_team_id', teamId).eq('player_id', userId).maybeSingle()
        if (!onTeam) {
          const { error: tErr } = await admin.from('league_team_players').insert({ league_team_id: teamId, player_id: userId })
          if (tErr) throw new Error(`Roster: ${tErr.message}`)
          report.addedToTeam++
        }
      } catch (e) {
        report.skipped.push({ player: p.fullName, reason: e instanceof Error ? e.message : String(e) })
      }
    }

    return res.status(200).json(report)
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e), report })
  }
}
```

- [ ] **Step 2: Preveri prevajanje**

Run: `npx tsc --noEmit`
Expected: brez napak. (Če `crypto.randomUUID` javi tip, dodaj `/// <reference lib="dom" />` ni potreben — Node 18+ ima globalni `crypto`; sicer `import { randomUUID } from 'crypto'` in uporabi `randomUUID()`.)

- [ ] **Step 3: Commit**

```bash
git add api/import-players.ts
git commit -m "feat(uvoz): Vercel funkcija /api/import-players (service-role pisanje)"
```

---

## Task 8: Admin stran — upload, predogled, potrditev

**Files:**
- Create: `src/pages/admin/PlayerImport.tsx`
- Modify: `src/App.tsx` (nova pot)
- Modify: `src/pages/admin/AdminDashboard.tsx` (kartica)

- [ ] **Step 1: Napiši admin stran**

Ustvari `src/pages/admin/PlayerImport.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { parseRegistrationFile } from '../../lib/playerImport/parseRegistrationXlsx'
import { computeStatuses } from '../../lib/playerImport/matchPlayers'
import type { ParseResult, ImportRow, ExistingUser, ImportReport } from '../../lib/playerImport/types'

interface Season { id: string; name: string }
interface Team { id: string; club_name: string }

const STATUS_BADGE: Record<string, string> = {
  new: 'bg-green-100 text-green-700', update: 'bg-blue-100 text-blue-700',
  transfer: 'bg-yellow-100 text-yellow-800', error: 'bg-red-100 text-red-700',
}
const STATUS_LABEL: Record<string, string> = { new: 'nov', update: 'posodobi', transfer: 'prestop', error: 'napaka' }

export default function PlayerImport() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [seasonId, setSeasonId] = useState('')
  const [teamId, setTeamId] = useState('')        // '' = nova ekipa
  const [newTeamName, setNewTeamName] = useState('')
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [rows, setRows] = useState<ImportRow[]>([])
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('league_seasons').select('id, name').order('name', { ascending: false })
      .then(({ data }) => setSeasons(data || []))
  }, [])

  useEffect(() => {
    if (!seasonId) { setTeams([]); return }
    supabase.from('league_teams').select('id, club_name').eq('season_id', seasonId).order('club_name')
      .then(({ data }) => setTeams(data || []))
  }, [seasonId])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(''); setReport(null)
    const file = e.target.files?.[0]; if (!file) return
    try {
      const result = await parseRegistrationFile(file)
      setParsed(result)
      if (!newTeamName) setNewTeamName(result.club.name)
      // obstoječi uporabniki za ujemanje (EMŠO)
      const { data: users } = await supabase.from('users').select('id, full_name, emso, club_id, date_of_birth')
      // klub ID za ujemanje: poišči po imenu (za status prestop)
      const { data: club } = await supabase.from('clubs').select('id').ilike('name', result.club.name).maybeSingle()
      setRows(computeStatuses(result.players, (users || []) as ExistingUser[], club?.id || '___none___'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setParsed(null); setRows([])
    }
  }

  async function doImport() {
    if (!parsed || !seasonId) return
    setBusy(true); setError(''); setReport(null)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess.session?.access_token
      const res = await fetch('/api/import-players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          club: parsed.club,
          target: { seasonId, teamId: teamId || null, newTeamClubName: teamId ? null : (newTeamName || parsed.club.name) },
          players: parsed.players.filter((_, i) => rows[i]?.status !== 'error'),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Napaka pri uvozu')
      setReport(json as ImportReport)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const counts = rows.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a }, {} as Record<string, number>)

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Uvoz igralcev (BZS Excel)</h1>
      <p className="text-sm text-gray-500 mb-6">Naloži registracijski obrazec kluba za sezono.</p>

      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <label className="text-sm">Sezona / liga
          <select className="w-full border rounded p-2 mt-1" value={seasonId} onChange={e => { setSeasonId(e.target.value); setTeamId('') }}>
            <option value="">— izberi —</option>
            {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="text-sm">Ekipa
          <select className="w-full border rounded p-2 mt-1" value={teamId} onChange={e => setTeamId(e.target.value)} disabled={!seasonId}>
            <option value="">➕ nova ekipa</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.club_name}</option>)}
          </select>
        </label>
      </div>
      {!teamId && (
        <label className="text-sm block mb-4">Ime nove ekipe (klub)
          <input className="w-full border rounded p-2 mt-1" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="iz glave Excela" />
        </label>
      )}

      <input type="file" accept=".xlsx" onChange={onFile} disabled={!seasonId} className="mb-4 block" />
      {!seasonId && <p className="text-xs text-amber-600 mb-4">Najprej izberi sezono.</p>}
      {error && <div className="bg-red-50 text-red-700 text-sm rounded p-3 mb-4">{error}</div>}

      {parsed && (
        <div className="mb-4">
          <div className="text-sm mb-2">Klub iz datoteke: <strong>{parsed.club.name}</strong>{parsed.club.season ? ` · sezona ${parsed.club.season}` : ''} · {parsed.players.length} igralcev</div>
          <div className="flex gap-2 text-xs mb-3">
            {(['new', 'update', 'transfer', 'error'] as const).map(s => counts[s] ? <span key={s} className={`px-2 py-1 rounded ${STATUS_BADGE[s]}`}>{STATUS_LABEL[s]}: {counts[s]}</span> : null)}
          </div>
          <div className="overflow-x-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="text-left p-2">Ime</th><th className="text-left p-2">EMŠO</th><th className="text-left p-2">Rojen</th><th className="text-left p-2">Status</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{r.player.fullName}</td>
                    <td className="p-2 text-gray-500">{r.player.emso || '—'}</td>
                    <td className="p-2 text-gray-500">{r.player.birthDate || '—'}</td>
                    <td className="p-2"><span className={`px-2 py-0.5 rounded text-xs ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}{r.error ? ` (${r.error})` : ''}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={doImport} disabled={busy} className="mt-4 bg-bocce-green text-white px-4 py-2 rounded disabled:opacity-50">
            {busy ? 'Uvažam…' : 'Potrdi in uvozi'}
          </button>
        </div>
      )}

      {report && (
        <div className="bg-green-50 text-green-800 text-sm rounded p-4">
          <div className="font-semibold mb-1">Uvoz končan</div>
          <ul className="list-disc ml-5">
            {report.clubCreated && <li>Ustvarjen nov klub</li>}
            {report.teamCreated && <li>Ustvarjena nova ligaška ekipa</li>}
            <li>Novi igralci: {report.created}</li>
            <li>Posodobljeni: {report.updated}</li>
            <li>Prestopi: {report.transferred}</li>
            <li>Dodani v ekipo: {report.addedToTeam}</li>
          </ul>
          {report.skipped.length > 0 && (
            <div className="mt-2 text-red-700">Izpuščeni: {report.skipped.map(s => `${s.player} (${s.reason})`).join('; ')}</div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Registriraj pot v `src/App.tsx`**

Dodaj import (poleg drugih admin importov, ~vrstica 25):

```tsx
import PlayerImport from './pages/admin/PlayerImport'
```

Dodaj pot v sklopu Admin (za `/admin/uporabniki`, ~vrstica 85):

```tsx
<Route path="/admin/uvoz-igralcev" element={<AdminRoute><PlayerImport /></AdminRoute>} />
```

- [ ] **Step 3: Dodaj kartico v `src/pages/admin/AdminDashboard.tsx`**

V polje `cards` (za kartico "Državne lige", ~vrstica 28) dodaj:

```tsx
    {
      to: '/admin/uvoz-igralcev',
      icon: '📥',
      title: 'Uvoz igralcev (Excel)',
      desc: 'Naloži BZS registracijski obrazec kluba → igralci v klub in ligaško ekipo',
      color: 'border-teal-300 hover:bg-teal-50',
    },
```

- [ ] **Step 4: Preveri prevajanje + build**

Run: `npx tsc --noEmit && npm run build`
Expected: brez napak.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/PlayerImport.tsx src/App.tsx src/pages/admin/AdminDashboard.tsx
git commit -m "feat(uvoz): admin stran za uvoz igralcev (upload, predogled, potrditev)"
```

---

## Task 9: Ročni obrazec za posameznega igralca

**Files:**
- Modify: `src/pages/admin/PlayerImport.tsx` (dodaj razdelek)

- [ ] **Step 1: Dodaj komponento `AddSinglePlayer` v isto datoteko**

Na konec `src/pages/admin/PlayerImport.tsx` (pred zadnjim `}` datoteke NE — kot ločena izvožena funkcija na koncu) dodaj:

```tsx
function AddSinglePlayer({ seasonId, teamId, newTeamName, clubName }: { seasonId: string; teamId: string; newTeamName: string; clubName: string }) {
  const [f, setF] = useState({ firstName: '', lastName: '', emso: '', birthDate: '', gender: 'M' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function submit() {
    if (!seasonId || !f.lastName) { setMsg('Manjka sezona ali priimek.'); return }
    setBusy(true); setMsg('')
    try {
      const { data: sess } = await supabase.auth.getSession()
      const fullName = `${f.firstName} ${f.lastName}`.replace(/\s+/g, ' ').trim()
      const res = await fetch('/api/import-players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.session?.access_token}` },
        body: JSON.stringify({
          club: { name: clubName || newTeamName },
          target: { seasonId, teamId: teamId || null, newTeamClubName: teamId ? null : (newTeamName || clubName) },
          players: [{
            firstName: f.firstName, lastName: f.lastName, fullName, gender: f.gender,
            birthDate: f.birthDate || null, emso: f.emso || null,
            birthCity: null, birthCountry: null, citizenship: null,
            addressStreet: null, addressHouse: null, addressPostal: null, addressCity: null, sportNumber: null, rowIndex: 0,
          }],
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Napaka')
      setMsg(`Dodan: ${fullName} (novi: ${json.created}, dodani v ekipo: ${json.addedToTeam})`)
      setF({ firstName: '', lastName: '', emso: '', birthDate: '', gender: 'M' })
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  return (
    <div className="mt-8 border-t pt-6">
      <h2 className="font-semibold text-gray-800 mb-2">Dodaj posameznega igralca</h2>
      <p className="text-xs text-gray-500 mb-3">Ustvari enega igralca in ga doda v zgoraj izbrani klub/ekipo.</p>
      <div className="grid sm:grid-cols-5 gap-2">
        <input className="border rounded p-2" placeholder="Ime" value={f.firstName} onChange={e => setF({ ...f, firstName: e.target.value })} />
        <input className="border rounded p-2" placeholder="Priimek" value={f.lastName} onChange={e => setF({ ...f, lastName: e.target.value })} />
        <input className="border rounded p-2" placeholder="EMŠO" value={f.emso} onChange={e => setF({ ...f, emso: e.target.value })} />
        <input className="border rounded p-2" placeholder="Rojen (d.m.llll)" value={f.birthDate} onChange={e => setF({ ...f, birthDate: e.target.value })} />
        <select className="border rounded p-2" value={f.gender} onChange={e => setF({ ...f, gender: e.target.value })}><option>M</option><option>Ž</option></select>
      </div>
      <button onClick={submit} disabled={busy} className="mt-3 bg-bocce-green text-white px-4 py-2 rounded disabled:opacity-50">{busy ? 'Dodajam…' : 'Dodaj igralca'}</button>
      {msg && <div className="mt-2 text-sm text-gray-700">{msg}</div>}
    </div>
  )
}
```

> Opomba: EMŠO in datum se v funkciji obravnavata surovo; datum "d.m.llll" naj admin vpiše v ISO (llll-mm-dd) ali pa razširi funkcijo, da uporabi `parseBirthDate`. Za V1 pričakuj ISO; validacija EMŠO poteka na strežniku prek obstoječe poti (neveljaven → `skipped`).

- [ ] **Step 2: Vključi obrazec v glavno komponento**

V `PlayerImport` vrni (pred zadnjim `</div>`) dodaj:

```tsx
      <AddSinglePlayer seasonId={seasonId} teamId={teamId} newTeamName={newTeamName} clubName={parsed?.club.name || newTeamName} />
```

- [ ] **Step 3: Preveri prevajanje + build**

Run: `npx tsc --noEmit && npm run build`
Expected: brez napak.

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/PlayerImport.tsx
git commit -m "feat(uvoz): ročni obrazec za posameznega igralca med sezono"
```

---

## Task 10: E2E preverjanje na Vercel Preview

**Files:** (brez sprememb kode; preverjanje)

- [ ] **Step 1: Zagotovi Vercel okoljski spremenljivki**

V Vercel projektu potrdi, da sta nastavljeni `SUPABASE_URL` in `SUPABASE_SERVICE_ROLE_KEY` (Production+Preview). Brez njiju funkcija vrne 500.

- [ ] **Step 2: Ustvari testno vejo in odpri PR (Preview deploy)**

```bash
git checkout -b feat/uvoz-igralcev
git push -u origin feat/uvoz-igralcev
```
Odpri PR → Vercel ustvari Preview URL.

- [ ] **Step 3: Ročni E2E na Preview URL**

Kot admin:
1. Odpri `/admin/uvoz-igralcev`.
2. Izberi testno sezono, "➕ nova ekipa" (ime "BK BEGUNJE TEST").
3. Naloži `C:\Users\HP\Downloads\Begunje.xlsx`.
4. Preveri predogled: klub "BK BEGUNJE", sezona 2025/26, ~20 igralcev, statusi (nov/posodobi/prestop).
5. Klikni "Potrdi in uvozi" → poročilo brez `skipped` napak (razen morebitnih neveljavnih EMŠO).
6. Preveri rezultat:
   - `/klubi` → klub "BK BEGUNJE" ima člane (users.club_id postavljen).
   - `/liga/<sezona>` → nova ekipa ima roster igralcev.
7. Ponovni uvoz iste datoteke → statusi "posodobi", poročilo: created 0, addedToTeam 0 (idempotentno).
8. Preizkusi "Dodaj posameznega igralca" (ISO datum) → poročilo created 1.

Expected: /klubi in ligaški roster kažeta igralce; ponovni uvoz ne podvaja.

- [ ] **Step 4: Preveri, da vodje niso uvožene**

V `Begunje.xlsx` je polje "Vodje ekipe" ločeno; potrdi, da noben vpis iz tega polja ni v ligaškem rosterju (parser bere le tabelo do noge).

- [ ] **Step 5: Merge PR → produkcija**

Po uspešnem E2E združi PR v `main`; Vercel deploya na balinar.app. Ročno preveri en klub na produkciji.

---

## Self-Review — pokritost spec

- **Spec §2 (vir/posebnosti):** klub iz glave (Task 5), oba formata datuma (Task 4), EMŠO validacija (Task 3), "Vodje ekipe" izključene (Task 5 FOOTER_RE + Task 10 Step 4). ✓
- **Spec §3 (preslikava):** vsa polja users/clubs (Task 7 patch + Task 5 parser); `address_city` migracija (Task 1). ✓
- **Spec §4 (tok):** admin stran upload/predogled/potrditev (Task 8); ročni obrazec (Task 9). ✓
- **Spec §5 (ujemanje/prestopi):** EMŠO + rezerva ime+datum, prestop premakne klub (Task 6 + Task 7). ✓
- **Spec §6 (arhitektura):** Vercel funkcija + service role + auth guard (Task 7); vercel.json rewrite (Task 1). ✓
- **Spec §7 (robni primeri):** neveljaven EMŠO → error/skip; dvojnik na ekipi → preskoči; nov klub/ekipa; napačna struktura → throw (Task 5/6/7). ✓
- **Spec §8 (testiranje):** unit testi Task 3–6; E2E Task 10. ✓
- **Spec §10 (odločitve):** O1 address_city (Task 1), O2 notes (Task 7), O3 ustvari ekipo (Task 7/8), O4 idempotentno+poročilo (Task 7). ✓
- **Spec §9 (izven obsega):** avtocomplete kluba pri ročnem dodajanju ekipe NI del tega načrta (ločena kasnejša izboljšava). ✓

Odprto tveganje: Excel serijski datum v testu (Task 4) — če pretvorba ne ustreza pričakovani vrednosti, popravi pričakovano vrednost testa (ne implementacije).
