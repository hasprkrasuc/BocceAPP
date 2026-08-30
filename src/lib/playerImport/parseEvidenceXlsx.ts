/**
 * Druga oblika uvoza: ravna tabela, izvožena iz evidence.balinanje.si.
 *
 * Za razliko od registracijskega obrazca (parseRegistrationXlsx.ts) tu ni glave
 * s podatki kluba — klub je zapisan v vsaki vrstici posebej, zato lahko ena
 * datoteka zajema več klubov hkrati.
 *
 * ZAMASKIRANE VREDNOSTI so bistvo te oblike. Izvoz namenoma zakrije poln datum
 * rojstva in EMŠO ter pusti le zadnje štiri znake:
 *
 *     Datum rojstva   "******1959"     → poznamo samo letnico
 *     EMŠO            "*********0189"  → poznamo samo ostanek
 *
 * Iz tega sledita dve pravili, ki ju ta datoteka spoštuje brez izjeme:
 *
 *   1. Zamaskirana vrednost NIKOLI ne pristane v `emso` ali `birthDate`.
 *      normalizeEmso("*********0189") vrne "0189" — štirimestno številko, ki je
 *      videti kot ključ, pa ni. Če bi jo spustili naprej, bi predogled vsakega
 *      igralca razglasil za novega (ujemanje po EMŠO ne bi našlo nič, nadomestno
 *      ujemanje po imenu pa se sploh ne bi izvedlo), strežnik pa bi vse skupaj
 *      zavrnil na preverbi 13 števk. Zato gresta v ločeni polji `birthYear` in
 *      `emsoSuffix`.
 *
 *   2. Ostanek EMŠO ni identifikator. Različno dolgi maski dasta lahko isti
 *      ostanek, v vzorčni datoteki pa se "0026" pojavi pri dveh različnih
 *      igralcih. Uporablja se samo za razločevanje med kandidati, ki se že
 *      ujemajo po imenu in letnici (glej matchPlayers.ts).
 *
 * Datoteka je čista — brez I/O in brez knjižnice xlsx (glej parseImportFile.ts).
 */

import type { ClubHeader, ParsedPlayer, ParseResult } from './types'
import { parseBirthDate, letnicaIzDatuma } from './parseDate'
import { normalizeEmso } from './emso'

/** Oznake, ki jih mora imeti glava tabele, da gre sploh za seznam igralcev. */
const OSNOVNE_OZNAKE = ['priimek', 'ime', 'emšo']

/**
 * Oznake, po katerih se izvoz iz evidence loči od registracijskega obrazca.
 * Obe obliki imata Priimek, Ime, EMŠO in celo Klub, zato prepoznava po njih ni
 * mogoča — razlikujejo šele Društvo, OBZ in Tekmovanje.
 */
const ZNACILNE_OZNAKE = ['društvo', 'obz', 'tekmovanje']

/** Koliko značilnih oznak mora biti prisotnih, da obliko prepoznamo. */
const DOVOLJ_ZNACILNIH = 2

/** Meji, znotraj katerih je letnica rojstva sploh verjetna. */
const LETNICA_OD = 1900
const LETNICA_DO = 2100

/** Najmanjša dolžina ostanka EMŠO, da je za razločevanje še kaj vreden. */
const NAJKRAJSI_OSTANEK = 4

function oznaka(v: unknown): string {
  return String(v ?? '').toLowerCase().trim()
}

function cellText(row: unknown[] | undefined, idx: number): string {
  if (!row || idx < 0) return ''
  const v = row[idx]
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function toNullable(s: string): string | null {
  return s === '' ? null : s
}

/** Ali je vrednost zakrita z zvezdicami. */
export function jeZamaskirano(raw: string): boolean {
  return raw.includes('*')
}

/**
 * Zadnje zaporedne števke zakrite vrednosti: "*********0189" → "0189",
 * "****1976" → "1976". Prazen niz, če na koncu ni števk.
 */
export function ostanekMaske(raw: string): string {
  const m = raw.match(/(\d+)\s*$/)
  return m ? m[1] : ''
}

/** Poišče vrstico z glavo tabele; -1, če je ni. */
export function najdiGlavoEvidence(rows: unknown[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length === 0) continue
    const lower = row.map(oznaka)
    const imaOsnovne = OSNOVNE_OZNAKE.every(o => lower.includes(o))
    if (!imaOsnovne) continue
    const znacilnih = ZNACILNE_OZNAKE.filter(o => lower.includes(o)).length
    if (znacilnih >= DOVOLJ_ZNACILNIH) return i
  }
  return -1
}

/**
 * Prepoznava oblike. Namenoma stroga in dvojno zavarovana: registracijski
 * obrazec, napačno prepoznan kot izvoz iz evidence, bi se prebral kot smeti
 * (druga glava, drugi stolpci, noga z izjavami), zato mora biti hkrati
 * izpolnjeno oboje — najdena značilna glava IN odsotnost glave kluba.
 */
export function jeEvidencniIzvoz(rows: unknown[][]): boolean {
  const imaGlavoKluba = rows.some(row => oznaka(row?.[0]).startsWith('balinarski klub'))
  if (imaGlavoKluba) return false
  return najdiGlavoEvidence(rows) >= 0
}

interface Stolpci {
  priimek: number
  ime: number
  klub: number
  drustvo: number
  spol: number
  datum: number
  emso: number
  sportnaSt: number
  tekmovanje: number
  eposta: number
}

/**
 * Poišče stolpec po oznaki. Najprej natančno ujemanje, nato začetek niza —
 * "Športna št." in "Športna številka" sta ista stvar, "Datum rojstva" pa se od
 * "Datum" v registracijskem obrazcu razlikuje ravno v tem repu.
 */
function najdiStolpec(lower: string[], ...variante: string[]): number {
  for (const v of variante) {
    const i = lower.indexOf(v)
    if (i >= 0) return i
  }
  for (const v of variante) {
    const i = lower.findIndex(o => o.startsWith(v))
    if (i >= 0) return i
  }
  return -1
}

/**
 * Stolpec z e-naslovom. Glava se med izvozi piše različno — videli smo
 * "e-mail balinar.app" in "Mail Balinar App" — zato ga po neuspelem natančnem
 * iskanju poiščemo še po vsebovani besedi "mail".
 *
 * Vsebovanost je tu varna, drugod pa ne, zato to NE sme v najdiStolpec: "ime"
 * je vsebovano v "priimek" in bi ime igralca brala napačna glava.
 *
 * Da se stolpec ne najde, ni malenkost: e-naslov je edini ključ, ki ujame
 * sodnika. Ta je v bazo prišel brez EMŠO in brez datuma rojstva, zato preostali
 * trije ključi na njem nimajo česa primerjati in se ob uvozu podvoji.
 */
function najdiStolpecEposte(lower: string[]): number {
  const tocno = najdiStolpec(lower, 'e-mail balinar.app', 'e-mail', 'email', 'e-pošta', 'eposta')
  if (tocno >= 0) return tocno
  return lower.findIndex(o => o.includes('mail') || o.includes('pošta') || o.includes('posta'))
}

function najdiStolpce(headerRow: unknown[]): Stolpci {
  const lower = headerRow.map(oznaka)
  return {
    priimek: najdiStolpec(lower, 'priimek'),
    ime: najdiStolpec(lower, 'ime'),
    klub: najdiStolpec(lower, 'klub'),
    drustvo: najdiStolpec(lower, 'društvo', 'drustvo'),
    spol: najdiStolpec(lower, 'spol'),
    datum: najdiStolpec(lower, 'datum rojstva', 'datum'),
    emso: najdiStolpec(lower, 'emšo', 'emso'),
    sportnaSt: najdiStolpec(lower, 'športna št.', 'športna', 'sportna'),
    tekmovanje: najdiStolpec(lower, 'tekmovanje'),
    // Novejši izvozi nosijo s sabo e-naslov iz aplikacije — enoličen ključ.
    eposta: najdiStolpecEposte(lower),
  }
}

/** Razčleni datum rojstva; pri zakriti vrednosti ostane sama letnica. */
function preberiRojstvo(row: unknown[], idx: number): { birthDate: string | null; birthYear: number | null } {
  const tekst = cellText(row, idx)
  if (tekst === '') return { birthDate: null, birthYear: null }

  if (jeZamaskirano(tekst)) {
    const ostanek = ostanekMaske(tekst)
    if (ostanek.length !== 4) return { birthDate: null, birthYear: null }
    const letnica = Number(ostanek)
    const verjetna = letnica >= LETNICA_OD && letnica <= LETNICA_DO
    return { birthDate: null, birthYear: verjetna ? letnica : null }
  }

  const surovo = row[idx]
  const birthDate = parseBirthDate(
    typeof surovo === 'number' || typeof surovo === 'string' ? surovo : null
  )
  return { birthDate, birthYear: letnicaIzDatuma(birthDate) }
}

/**
 * Razčleni uradno oznako osebe. Za polnovredno štejemo natanko 13 števk
 * (slovenski EMŠO) ali natanko 11 (tuja oznaka, hrvaški OIB); vse drugo
 * (zakrito, okrnjeno, brez vodilne ničle) gre v ostanek, ki ključ ni.
 *
 * Brez 11-mestne možnosti bi OIB tujca pristal med ostanki maske in nikoli v
 * stolpcu `emso` — igralca torej ne bi bilo mogoče ujeti po njegovi oznaki.
 */
function preberiEmso(row: unknown[], idx: number): { emso: string | null; emsoSuffix: string | null } {
  const tekst = cellText(row, idx)
  if (tekst === '') return { emso: null, emsoSuffix: null }

  const cifre = normalizeEmso(tekst)
  if (!jeZamaskirano(tekst) && (cifre.length === 13 || cifre.length === 11)) {
    return { emso: cifre, emsoSuffix: null }
  }

  const ostanek = cifre.slice(-NAJKRAJSI_OSTANEK)
  return { emso: null, emsoSuffix: ostanek.length === NAJKRAJSI_OSTANEK ? ostanek : null }
}

/**
 * Razčleni ravno tabelo iz evidence.
 *
 * Vrne VSE igralce iz datoteke, tudi kadar jih je iz več klubov — izbiro
 * prepusti vmesniku. Tiho zliti več klubov v en cilj uvoza bi pomenilo množičen
 * napačen prestop, ta pa se v bazi ne da razveljaviti (prejšnji klub se nikamor
 * ne shrani).
 */
export function parseEvidenceRows(rows: unknown[][]): ParseResult {
  const headerIdx = najdiGlavoEvidence(rows)
  if (headerIdx < 0) {
    throw new Error('V datoteki ni najdena tabela z glavo (Priimek, Ime, EMŠO, Društvo/OBZ/Tekmovanje).')
  }

  const cols = najdiStolpce(rows[headerIdx])
  const players: ParsedPlayer[] = []
  const warnings: string[] = []
  const klubi: string[] = []
  const tekmovanja: string[] = []

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length === 0) continue

    const lastName = cellText(row, cols.priimek)
    const firstName = cellText(row, cols.ime)
    if (!lastName && !firstName) continue
    if (!lastName) {
      warnings.push(`Vrstica ${i + 1}: manjka priimek — izpuščeno (ime: "${firstName}")`)
      continue
    }

    const genderRaw = cellText(row, cols.spol).toUpperCase()
    const gender = genderRaw === 'M' ? 'M' : genderRaw === 'Ž' || genderRaw === 'Z' ? 'Ž' : null

    const { birthDate, birthYear } = preberiRojstvo(row, cols.datum)
    const { emso, emsoSuffix } = preberiEmso(row, cols.emso)

    // Vrstni red je IME PRIIMEK, čeprav ima datoteka priimek v prvem stolpcu:
    // obstoječi zapisi v bazi so nastali iz registracijskega obrazca v tem
    // vrstnem redu, ujemanje pa primerja normalizirano ime kot celoto in besed
    // ne preuredi. Obrnjen vrstni red tu bi pomenil, da se ne ujame nihče.
    const fullName = `${firstName} ${lastName}`.replace(/\s+/g, ' ').trim()

    const sourceClub = toNullable(cellText(row, cols.klub)) ?? toNullable(cellText(row, cols.drustvo))
    if (sourceClub && !klubi.includes(sourceClub)) klubi.push(sourceClub)

    const sourceCompetition = toNullable(cellText(row, cols.tekmovanje))
    if (sourceCompetition && !tekmovanja.includes(sourceCompetition)) tekmovanja.push(sourceCompetition)

    players.push({
      firstName,
      lastName,
      fullName,
      gender,
      birthDate,
      emso,
      birthYear,
      emsoSuffix,
      birthCity: null,
      birthCountry: null,
      citizenship: null,
      addressStreet: null,
      addressHouse: null,
      addressPostal: null,
      addressCity: null,
      sportNumber: toNullable(cellText(row, cols.sportnaSt)),
      // Izvoz iz evidence zveze stolpca "Reg. št." nima — ta je le na obrazcih
      // območnih zvez.
      regNumber: null,
      email: toNullable(cellText(row, cols.eposta).toLowerCase()),
      sourceClub,
      sourceCompetition,
      rowIndex: i,
    })
  }

  if (players.length === 0) warnings.push('V tabeli ni najden noben igralec.')

  const zamaskiranih = players.filter(p => p.birthDate === null && p.emso === null).length
  if (zamaskiranih > 0 && players.every(p => !p.sportNumber)) {
    warnings.push(
      `Izvoz je zamaskiran (${zamaskiranih} od ${players.length} igralcev brez datuma rojstva in EMŠO), ` +
      'stolpec "Športna št." pa je prazen. Ujemanje bo šlo po imenu in letnici rojstva, ' +
      'igralcev, ki jih v bazi še ni, pa iz te datoteke ni mogoče ustvariti.'
    )
  }
  if (klubi.length > 1) {
    warnings.push(`Datoteka zajema ${klubi.length} klubov — pred uvozom izberi enega.`)
  }

  // ClubHeader je obvezen del pogodbe (strežnik zavrne zahtevo brez club.name).
  // Pri enem samem klubu ga izpolnimo, sicer ostane prazen in ga postavi vmesnik
  // po izbiri admina.
  const club: ClubHeader = {
    name: klubi.length === 1 ? klubi[0] : '',
    season: null,
    regId: null,
    taxId: null,
    mailAddress: null,
    contactName: null,
    phone: null,
    email: null,
  }

  return { club, players, warnings, format: 'evidenca', clubs: klubi, competitions: tekmovanja }
}
