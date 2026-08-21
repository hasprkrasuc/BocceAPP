export type Gender = 'M' | 'Ž'

export interface ParsedPlayer {
  firstName: string
  lastName: string
  fullName: string
  gender: Gender | null
  birthDate: string | null      // YYYY-MM-DD
  emso: string | null           // 13 števk ali null
  /**
   * Letnica rojstva. Pri neokrnjenih virih izpeljana iz `birthDate`, pri
   * zamaskiranem izvozu iz evidence pa edino, kar o rojstvu sploh vemo.
   */
  birthYear: number | null
  /**
   * Zadnje števke EMŠO iz zamaskiranega izvoza ("*********0189" → "0189").
   * NI EMŠO: nikoli ne sme pristati v `users.emso` in nikoli ne sme biti
   * primarni ključ ujemanja — različne maske se lahko zlijejo v isti ostanek.
   * Služi izključno razločevanju med kandidati, ki se že ujemajo po imenu in letnici.
   */
  emsoSuffix: string | null
  birthCity: string | null
  birthCountry: string | null
  citizenship: string | null
  addressStreet: string | null
  addressHouse: string | null
  addressPostal: string | null
  addressCity: string | null
  sportNumber: string | null
  /**
   * Klub, zapisan v sami vrstici. Registracijski obrazec ga nima (klub je v
   * glavi, zato null), izvoz iz evidence pa lahko zajema več klubov hkrati.
   */
  sourceClub: string | null
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

/** Katera oblika datoteke je bila prepoznana. */
export type ImportFormat = 'bzs' | 'evidenca'

export interface ParseResult {
  club: ClubHeader
  players: ParsedPlayer[]
  warnings: string[]
  /** Prepoznana oblika; vmesnik jo pokaže, da je jasno, po katerih pravilih so nastali statusi. */
  format?: ImportFormat
  /** Vsi klubi, najdeni v datoteki. Samo izvoz iz evidence jih lahko ima več. */
  clubs?: string[]
}

export type MatchStatus = 'new' | 'update' | 'transfer' | 'error'

export interface ExistingUser {
  id: string
  full_name: string | null
  emso: string | null
  club_id: string | null
  date_of_birth: string | null
  /** Izpeljan stolpec v bazi; edini podatek o rojstvu, ki ga da zamaskiran izvoz. */
  birth_year: number | null
  /** Številka licence pri zvezi; v izvozu iz evidence ji ustreza "Športna št.". */
  license_number: string | null
}

export interface ImportRow {
  player: ParsedPlayer
  status: MatchStatus
  existingUserId: string | null
  currentClubId: string | null
  error: string | null      // blokira uvoz (igralca ne moremo varno obdelati)
  warning: string | null    // NE blokira (npr. neveljavna kontrolna števka EMŠO)
}

export interface ImportTarget {
  seasonId: string
  clubId: string | null          // izbran obstoječi klub; null = ustvari nov klub iz podatkov glave
  teamId: string | null          // obstoječa ligaška ekipa; null = ustvari novo
  newTeamClubName: string | null // ime nove ekipe (če teamId null)
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
