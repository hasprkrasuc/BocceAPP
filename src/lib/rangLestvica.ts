/**
 * RANG LESTVICA — izračun (liga + državna prvenstva, zadnjih 365 dni).
 *
 * Izvlečeno iz strani LeagueRanking, da ga lahko ponovno uporabi tudi stran
 * igralca (PlayerDetail) za "mesto + točke na skupni rang lestvici".
 *
 * Liga rang:  rang = utežene match točke × ligaKoef × % uspešnosti
 * DP točke:   1. m. 16 · 2. m. 10 · 3. m. 8 · 4. m. 7 · 5.–8. m. 3 · 9.–16. m. 1
 * Skupni rang = ligaRang + dpPts
 */

import { supabase } from '../supabase'
import { aggregatePlayerStats, calculateRang } from '../engines/leagueStats'
import type {
  LeagueFixture, LeagueMatchResult, LeagueMatchDisciplineResult, LeagueSeasonDiscipline,
} from '../types'

export const TIER_LABELS: Record<string, string> = {
  super_liga:     'Super liga',
  '1_liga':       '1. liga',
  '2_liga_zahod': '2. liga zahod',
  '2_liga_vzhod': '2. liga vzhod',
}

/** Točke za PORAŽENCA izločilnega kroga (zmagovalec napreduje). */
const STAGE_LOSER_PTS: Record<string, { pts: number; placeLabel: string }> = {
  qf:  { pts: 3, placeLabel: '5.–8. mesto' },
  r16: { pts: 1, placeLabel: '9.–16. mesto' },
}
/** Točke za finalna kroga (zmagovalec in poraženec dobita). */
const STAGE_FINAL_PTS = {
  final:       { winner: 16, loser: 10, winnerPlace: '1. mesto', loserPlace: '2. mesto' },
  third_place: { winner: 8,  loser: 7,  winnerPlace: '3. mesto', loserPlace: '4. mesto' },
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ChampEntry { champName: string; placeLabel: string; pts: number }
export interface LigaEntry { name: string; tier: string; rang: number }

export interface RangRow {
  playerId: string
  displayName: string
  club: string | null
  /** ligaRang + dpPts */
  rang: number
  ligaRang: number
  dpPts: number
  totalPlayed: number
  totalMatchPointsFor: number
  uspesnostPct: number
  isUuid: boolean
  ligaEntries: LigaEntry[]
  champEntries: ChampEntry[]
}

/** Povzetek igralčeve statistike v eni sezoni (za stran igralca). */
export interface PlayerSeasonSummary {
  seasonId: string
  seasonName: string
  tier: string
  played: number
  matchPointsFor: number
  uspesnostPct: number
  rang: number
  active: boolean
}

export interface RangLestvica {
  rows: RangRow[]
  seasonStatsByPlayer: Record<string, PlayerSeasonSummary[]>
  cutoffLabel: string
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${parseInt(d)}. ${parseInt(m)}. ${y}`
}

/** Izračuna skupno rang lestvico + povzetke po sezonah za vsakega igralca. */
export async function computeRangLestvica(): Promise<RangLestvica> {
  const today = new Date()
  const cutoff = new Date(today)
  cutoff.setFullYear(cutoff.getFullYear() - 1)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const todayStr = today.toISOString().slice(0, 10)
  const currentYear = today.getFullYear()
  const cutoffLabel = `${formatDate(cutoffStr)} – ${formatDate(todayStr)}`

  type PlayerAcc = {
    ligaRang: number
    dpPts: number
    totalPlayed: number
    totalMatchPointsFor: number
    ligaEntries: LigaEntry[]
    champEntries: ChampEntry[]
    clubName: string | null
  }
  const acc: Record<string, PlayerAcc> = {}
  const seasonStatsByPlayer: Record<string, PlayerSeasonSummary[]> = {}

  function ensureAcc(pid: string) {
    if (!acc[pid]) acc[pid] = {
      ligaRang: 0, dpPts: 0, totalPlayed: 0, totalMatchPointsFor: 0,
      ligaEntries: [], champEntries: [], clubName: null,
    }
  }

  // ── Liga sezone ───────────────────────────────────────────────────────────
  const { data: seasons, error: sErr } = await supabase
    .from('league_seasons')
    .select('id, name, tier, year, status, win_points, draw_points, loss_points, rounds_count')
    .gte('year', currentYear - 2)
    .order('year', { ascending: false })
  if (sErr) throw sErr

  if (seasons?.length) {
    type SeasonBundle = {
      season: typeof seasons[0]
      fixtures: LeagueFixture[]
      disciplines: LeagueSeasonDiscipline[]
      matchResults: Array<LeagueMatchResult & { discipline_results?: LeagueMatchDisciplineResult[] }>
      playerClub: Record<string, string>
    }

    const bundles: SeasonBundle[] = await Promise.all(
      seasons.map(async season => {
        const fixtureQuery = supabase
          .from('league_fixtures')
          .select('id, season_id, round_number, home_team_id, away_team_id, home_score, away_score, status, scheduled_date, chief_judge_id, judge_ids, group_label')
          .eq('season_id', season.id)

        const [{ data: fixtures }, { data: teamData }] = await Promise.all([
          season.year >= currentYear - 1
            ? fixtureQuery
            : fixtureQuery.gte('scheduled_date', cutoffStr).lte('scheduled_date', todayStr),
          supabase.from('league_teams')
            .select('club_name, league_team_players(player_id)')
            .eq('season_id', season.id),
        ])

        const fixtureIds = (fixtures ?? []).map(f => f.id)

        const [{ data: disciplines }, { data: matchResults }] = await Promise.all([
          supabase.from('league_season_disciplines').select('*').eq('season_id', season.id),
          fixtureIds.length > 0
            ? supabase.from('league_match_results')
                .select('*, discipline_results:league_match_discipline_results(*)')
                .in('fixture_id', fixtureIds)
            : Promise.resolve({ data: [] as unknown[] }),
        ])

        const playerClub: Record<string, string> = {}
        for (const team of (teamData ?? []) as Array<{ club_name: string; league_team_players: Array<{ player_id: string }> }>) {
          for (const tp of (team.league_team_players ?? [])) {
            if (tp.player_id) playerClub[tp.player_id] = team.club_name
          }
        }

        return {
          season,
          fixtures: (fixtures ?? []) as LeagueFixture[],
          disciplines: (disciplines ?? []) as LeagueSeasonDiscipline[],
          matchResults: (matchResults ?? []) as Array<LeagueMatchResult & { discipline_results?: LeagueMatchDisciplineResult[] }>,
          playerClub,
        }
      }),
    )

    for (const { season, fixtures, disciplines, matchResults, playerClub } of bundles) {
      const playerStats = aggregatePlayerStats(matchResults, fixtures, disciplines)
      for (const ps of playerStats) {
        if (ps.totalPlayed === 0) continue
        const entry = calculateRang(ps, season.tier)
        ensureAcc(ps.playerId)
        acc[ps.playerId].ligaRang += entry.rang
        acc[ps.playerId].totalPlayed += entry.totalPlayed
        acc[ps.playerId].totalMatchPointsFor += entry.totalMatchPointsFor
        acc[ps.playerId].ligaEntries.push({ name: season.name, tier: season.tier, rang: entry.rang })
        if (!acc[ps.playerId].clubName && playerClub[ps.playerId]) {
          acc[ps.playerId].clubName = playerClub[ps.playerId]
        }
        // Povzetek po sezoni (za stran igralca)
        if (!seasonStatsByPlayer[ps.playerId]) seasonStatsByPlayer[ps.playerId] = []
        seasonStatsByPlayer[ps.playerId].push({
          seasonId: season.id,
          seasonName: season.name,
          tier: season.tier,
          played: ps.totalPlayed,
          matchPointsFor: ps.totalMatchPointsFor,
          uspesnostPct: ps.totalPlayed > 0 ? ps.totalMatchPointsFor / (ps.totalPlayed * 2) : 0,
          rang: entry.rang,
          active: season.status === 'active',
        })
      }
    }
  }

  // ── Državna prvenstva ─────────────────────────────────────────────────────
  const { data: championships } = await supabase
    .from('tournaments')
    .select('id, name, date')
    .eq('kind', 'championship')
    .eq('status', 'completed')
    .gte('date', cutoffStr)
    .lte('date', todayStr)

  if (championships?.length) {
    await Promise.all(championships.map(async champ => {
      const { data: matches } = await supabase
        .from('matches')
        .select(`
          id, stage, status, winner_id, is_bye, team_a_id, team_b_id,
          team_a:group_teams!matches_team_a_id_fkey(
            id, registration:tournament_registrations!group_teams_registration_id_fkey(player1_id, player2_id)
          ),
          team_b:group_teams!matches_team_b_id_fkey(
            id, registration:tournament_registrations!group_teams_registration_id_fkey(player1_id, player2_id)
          )
        `)
        .eq('tournament_id', champ.id)
        .in('stage', ['final', 'third_place', 'qf', 'r16'])
        .eq('status', 'completed')

      type MatchRow = {
        stage: string; winner_id: string | null; is_bye: boolean
        team_a_id: string | null; team_b_id: string | null
        team_a: Array<{ id: string; registration: Array<{ player1_id: string; player2_id: string | null }> }>
        team_b: Array<{ id: string; registration: Array<{ player1_id: string; player2_id: string | null }> }>
      }

      for (const match of (matches ?? []) as unknown as MatchRow[]) {
        if (!match.winner_id) continue
        const loserId = match.team_a_id === match.winner_id ? match.team_b_id : match.team_a_id

        function awardPts(teamId: string | null, pts: number, placeLabel: string) {
          if (!teamId || pts <= 0) return
          const teamArr = teamId === match.team_a_id ? match.team_a : match.team_b
          const reg = teamArr?.[0]?.registration?.[0]
          if (!reg) return
          for (const pid of [reg.player1_id, reg.player2_id]) {
            if (!pid) continue
            ensureAcc(pid)
            acc[pid].dpPts += pts
            acc[pid].champEntries.push({ champName: champ.name, placeLabel, pts })
          }
        }

        if (match.stage === 'final') {
          awardPts(match.winner_id, STAGE_FINAL_PTS.final.winner, STAGE_FINAL_PTS.final.winnerPlace)
          awardPts(loserId, STAGE_FINAL_PTS.final.loser, STAGE_FINAL_PTS.final.loserPlace)
        } else if (match.stage === 'third_place') {
          awardPts(match.winner_id, STAGE_FINAL_PTS.third_place.winner, STAGE_FINAL_PTS.third_place.winnerPlace)
          awardPts(loserId, STAGE_FINAL_PTS.third_place.loser, STAGE_FINAL_PTS.third_place.loserPlace)
        } else if (!match.is_bye) {
          const stagePts = STAGE_LOSER_PTS[match.stage]
          if (stagePts) awardPts(loserId, stagePts.pts, stagePts.placeLabel)
        }
      }
    }))
  }

  // ── Razreši imena & klube ─────────────────────────────────────────────────
  const allIds = Object.keys(acc)
  if (!allIds.length) return { rows: [], seasonStatsByPlayer, cutoffLabel }

  const uuidIds = allIds.filter(id => UUID_RE.test(id))
  const { data: users } = uuidIds.length > 0
    ? await supabase.from('users').select('id, full_name, club, role').in('id', uuidIds)
    : { data: [] }
  const playerUsers = (users ?? []).filter((u: { role?: string }) => u.role !== 'judge')
  const userMap = Object.fromEntries(playerUsers.map((u: { id: string; full_name: string | null; club: string | null }) => [u.id, u]))

  const rows: RangRow[] = allIds
    .filter(pid => acc[pid].totalPlayed > 0 || acc[pid].dpPts > 0)
    .map(pid => {
      const a = acc[pid]
      const isUuid = UUID_RE.test(pid)
      const user = isUuid ? userMap[pid] : null
      const totalPossible = a.totalPlayed * 2
      const club = a.clubName ?? user?.club ?? null
      return {
        playerId: pid,
        displayName: user?.full_name ?? (isUuid ? `?? ${pid.slice(0, 8)}` : pid),
        club,
        rang: a.ligaRang + a.dpPts,
        ligaRang: a.ligaRang,
        dpPts: a.dpPts,
        totalPlayed: a.totalPlayed,
        totalMatchPointsFor: a.totalMatchPointsFor,
        uspesnostPct: totalPossible > 0 ? a.totalMatchPointsFor / totalPossible : 0,
        isUuid,
        ligaEntries: a.ligaEntries.sort((x, y) => y.rang - x.rang),
        champEntries: a.champEntries.sort((x, y) => y.pts - x.pts),
      }
    })
    .sort((a, b) => b.rang - a.rang || b.totalPlayed - a.totalPlayed)

  return { rows, seasonStatsByPlayer, cutoffLabel }
}
