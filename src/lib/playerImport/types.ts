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
