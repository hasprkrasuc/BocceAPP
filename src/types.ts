// ─── Enums / Union types ────────────────────────────────────────────────────

export type UserRole = 'player' | 'admin' | 'super_admin' | 'judge'
export type TournamentKind = 'tournament' | 'championship'
export type TournamentStatus = 'draft' | 'registration_open' | 'in_progress' | 'completed'
export type TournamentCategory = 'men' | 'women' | 'u18' | 'mixed' | 'u18_women' | 'u15' | 'u12'
export type RegistrationStatus = 'pending' | 'confirmed' | 'rejected'
export type MatchStage = 'group' | 'r128' | 'r64' | 'r32' | 'r16' | 'qf' | 'sf' | 'final' | 'third_place'
export type MatchType = 'zm' | 'po' | 'r' | 'bye' | 'knockout'
export type MatchStatus = 'pending' | 'completed'
export type GroupStatus = 'pending' | 'in_progress' | 'completed'
export type LeagueSeasonStatus = 'draft' | 'active' | 'completed'
export type LeagueCategory = 'men' | 'women' | 'u18' | 'u18_women' | 'u15' | 'u14' | 'u12' | 'mixed'
export type LeagueTier = 'super_liga' | '1_liga' | '2_liga_zahod' | '2_liga_vzhod' | 'obz'
export type DisciplineType = 'trojka' | 'dvojka' | 'posamezno' | 'krog' | 'hitrostno' | 'natancno' | 'blizanje' | 'blizanje_krog' | 'stafeta' | 'podaljsek'
export type FixtureStatus = 'scheduled' | 'completed'

// ─── Database row types ──────────────────────────────────────────────────────

export interface Club {
  id: string
  name: string
  short_name: string | null
  city: string | null
  founded_year: number | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  website: string | null
  logo_url: string | null
  team_photo_url: string | null
  notes: string | null
  created_at: string
  members?: UserProfile[]
}

export interface UserProfile {
  id: string
  full_name: string | null
  email?: string
  club: string | null
  club_id: string | null
  role: UserRole
  phone?: string | null
  license_number?: string | null
  date_of_birth?: string | null
  photo_url?: string | null
  gender?: string | null
  // Razširjeni osebni podatki (iz BZS registracije)
  emso?: string | null
  birth_city?: string | null
  birth_country?: string | null
  citizenship?: string | null
  address_street?: string | null
  address_house?: string | null
  address_postal?: string | null
  address_country?: string | null
}

export type TournamentSeriesStatus = 'draft' | 'active' | 'completed'

export interface TournamentSeries {
  id: string
  name: string
  year: number
  category: 'u14' | 'u18'
  counting_results: number | null
  status: TournamentSeriesStatus
  created_at: string
}

export interface Tournament {
  id: string
  name: string
  date: string
  location: string
  category: TournamentCategory
  kind: TournamentKind
  status: TournamentStatus
  group_size: number
  registration_deadline: string | null
  notes: string | null
  max_teams: number | null
  series_id: string | null
  discipline_type: DisciplineType | null
  format: 'groups' | 'knockout'
}

export interface TournamentRegistration {
  id: string
  tournament_id: string
  player1_id: string
  player2_id: string | null
  status: RegistrationStatus
  registered_at: string
  player1?: UserProfile
  player2?: UserProfile
}

export interface TournamentGroup {
  id: string
  tournament_id: string
  group_number: number
  status: GroupStatus
  venue_name: string | null
  group_size: number | null
}

export interface GroupDistribution {
  totalGroups: number
  groups3: number
  groups4: number
  groups5: number
  extraRoundGroups: number
  directGroups: number
  targetKnockout: number
  directStage: MatchStage
  extraStage: MatchStage | null
}

export interface GroupTeam {
  id: string
  group_id: string
  registration_id: string
  seed: number
  registration?: TournamentRegistration
}

export interface Match {
  id: string
  tournament_id: string
  group_id: string | null
  stage: MatchStage
  match_type: MatchType
  match_number: number
  team_a_id: string | null
  team_b_id: string | null
  score_a: number | null
  score_b: number | null
  winner_id: string | null
  is_bye: boolean
  status: MatchStatus
  played_at: string | null
  team_a?: GroupTeam
  team_b?: GroupTeam
}

export interface LeagueSeason {
  id: string
  name: string
  year: number
  category: LeagueCategory
  status: LeagueSeasonStatus
  tier: LeagueTier
  obz_name: string | null
  rounds_count: number
  win_points: number
  draw_points: number
  loss_points: number
}

export interface LeagueTeam {
  id: string
  season_id: string
  club_name: string
  short_name: string | null
  captain_id: string | null
  /** Žrebana številka (1..N) za Bergerjev razpored; NULL = žreb še ni opravljen */
  draw_number: number | null
  captain?: UserProfile
  league_team_players?: LeagueTeamPlayer[]
}

export interface LeagueTeamPlayer {
  id: string
  league_team_id: string
  player_id: string
  jersey_number?: number | null
  player?: UserProfile
}

export interface LeagueSeasonDiscipline {
  id: string
  season_id: string
  name: string
  discipline_type: DisciplineType
  players_per_side: number
  has_reserve: boolean
  block_number: number
  order_num: number
}

export interface LeagueMatchResult {
  id: string
  fixture_id: string
  judges: string | null
  chief_judge: string | null
  viewers: number | null
  time_end: string | null
  draw_natancno_field: 1 | 4 | null
  draw_blok4: Record<string, number> | null
  created_at: string
  discipline_results?: LeagueMatchDisciplineResult[]
}

export interface LeagueMatchDisciplineResult {
  id: string
  match_result_id: string
  discipline_id: string
  playground_number: number | null
  home_score: number | null
  away_score: number | null
  home_match_points: 0 | 1 | 2 | null
  away_match_points: 0 | 1 | 2 | null
  home_players: string[]
  away_players: string[]
  discipline?: LeagueSeasonDiscipline
}

export interface LeagueFixture {
  id: string
  season_id: string
  round_number: number
  home_team_id: string
  away_team_id: string
  home_score: number | null
  away_score: number | null
  status: FixtureStatus
  scheduled_date: string | null
  chief_judge_id: string | null
  judge_ids: string[]
  /** NULL = no groups (Super Liga). 'A'/'B' = phase-1 skupini. '1-6'/'7-12' = phase-2 nadaljevalni skupini. */
  group_label: string | null
  home_team?: LeagueTeam
  away_team?: LeagueTeam
}

// ─── Dvojna registracija ─────────────────────────────────────────────────────

export type DoubleRegStatus = 'pending' | 'approved' | 'rejected'

export interface DoubleRegistration {
  id: string
  player_id: string
  primary_team_id: string
  secondary_team_id: string
  season_id: string
  status: DoubleRegStatus
  requested_at: string
  resolved_at: string | null
  resolved_by: string | null
  notes: string | null
  player?: UserProfile
  primary_team?: LeagueTeam & { season?: Pick<LeagueSeason, 'id' | 'name' | 'tier' | 'category'> }
  secondary_team?: LeagueTeam & { season?: Pick<LeagueSeason, 'id' | 'name' | 'tier' | 'category'> }
}

export interface PlayerStatistics {
  id: string
  player_id: string
  year: number
  tournaments_played: number
  matches_won: number
  matches_lost: number
  points_scored: number
  titles: number
  podiums: number
  player?: UserProfile
}

// ─── Engine types ────────────────────────────────────────────────────────────

export type GroupSize = 3 | 4 | 5

export type TeamDescriptor =
  | { seed: number }
  | { winsMatch: number }
  | { losesMatch: number }
  | 'BYE'

export interface MatchTemplate {
  num: number
  type: MatchType
  teamA: TeamDescriptor
  teamB: TeamDescriptor
}

export interface MatchResultEntry<T> {
  winner: T | null
  loser: T | null
}

export interface GroupMatch<T> {
  num: number
  type: MatchType
  teamA: T | null
  teamB: T | null
  isBye: boolean
  scoreA: number | null
  scoreB: number | null
  winner: T | null
  loser: T | null
  played: boolean
  depA: TeamDescriptor
  depB: TeamDescriptor
}

export interface TeamStats {
  team: LeagueTeam
  played: number
  won: number
  drawn: number
  lost: number
  pointsFor: number
  pointsAgainst: number
  difference: number
  points: number
}

export interface KnockoutBracketResult {
  firstStage: MatchStage
  matches: KnockoutMatchEntry[]
  totalTeams: number
}

export interface KnockoutMatchEntry {
  stage: MatchStage
  matchNumber: number
  teamA: GroupTeam | null
  teamB: GroupTeam | null
  scoreA: number | null
  scoreB: number | null
  winner: GroupTeam | null
  loser?: GroupTeam | null
  played: boolean
}

export interface GroupQualifier {
  groupNumber: number
  position: 1 | 2
  team: GroupTeam | null
  teamId?: string
}

// ─── Auth context value ──────────────────────────────────────────────────────

export interface AuthContextValue {
  user: import('@supabase/supabase-js').User | null
  profile: UserProfile | null
  loading: boolean
  isAdmin: boolean
  isSuperAdmin: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string, club: string) => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<UserProfile>) => Promise<UserProfile>
  refreshProfile: () => void
}
