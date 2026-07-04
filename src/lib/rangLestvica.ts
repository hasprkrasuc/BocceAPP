/**
 * RANG LESTVICA — izračun (liga + državna prvenstva).
 *
 * Ločeno po kategoriji: Moški, Ženske, U18, U14. Vsaka lestvica šteje le
 * sezone/prvenstva svoje kategorije.
 *
 * Okno DP: MOŠKI štejejo le najnovejše leto DP (vsa 2025 veljajo, dokler ni
 * prvega 2026 DP); OSTALE kategorije 365-dnevno drseče okno.
 *
 * Liga rang:  rang = utežene match točke × ligaKoef × % uspešnosti
 * DP točke:   1. m. 16 · 2. m. 10 · 3. m. 8 · 4. m. 7 · 5.–8. m. 3 · 9.–16. m. 1
 * Skupni rang = ligaRang + dpPts
 */

import { supabase } from '../supabase'
import { aggregatePlayerStats, calculateRang } from '../engines/leagueStats'
import { championshipPoints, type ChampKoMatch } from './championshipPoints'
import type {
  LeagueFixture, LeagueMatchResult, LeagueMatchDisciplineResult, LeagueSeasonDiscipline,
} from '../types'

export const TIER_LABELS: Record<string, string> = {
  super_liga:     'Super liga',
  '1_liga':       '1. liga',
  '2_liga_zahod': '2. liga zahod',
  '2_liga_vzhod': '2. liga vzhod',
}

/** Kategorije rang lestvic. */
export type RangCategory = 'men' | 'women' | 'u18' | 'u14'
export const RANG_CATEGORIES: RangCategory[] = ['men', 'women', 'u18', 'u14']
export const RANG_CATEGORY_LABELS: Record<RangCategory, string> = {
  men: 'Moški', women: 'Ženske', u18: 'U18', u14: 'U14',
}

/** Preslika kategorijo sezone/prvenstva na rang kategorijo (ali null, če ne sodi v eno od štirih). */
function toRangCategory(cat: string | null | undefined): RangCategory | null {
  switch (cat) {
    case 'men': return 'men'
    case 'women': return 'women'
    case 'u18': return 'u18'
    case 'u14': return 'u14'
    default: return null
  }
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
  year: number
  status: string
  played: number
  matchPointsFor: number
  uspesnostPct: number
  rang: number
  active: boolean
}

export interface RangLestvica {
  /** Razvrščene rang lestvice po kategoriji (Moški / Ženske / U18 / U14). */
  byCategory: Record<RangCategory, RangRow[]>
  seasonStatsByPlayer: Record<string, PlayerSeasonSummary[]>
  cutoffLabel: string
}

type PlayerAcc = {
  ligaRang: number
  dpPts: number
  totalPlayed: number
  totalMatchPointsFor: number
  ligaEntries: LigaEntry[]
  champEntries: ChampEntry[]
  clubName: string | null
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${parseInt(d)}. ${parseInt(m)}. ${y}`
}

/** Izračuna rang lestvice (po kategoriji) + povzetke po sezonah za vsakega igralca. */
export async function computeRangLestvica(): Promise<RangLestvica> {
  const today = new Date()
  const cutoff = new Date(today)
  cutoff.setFullYear(cutoff.getFullYear() - 1)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const todayStr = today.toISOString().slice(0, 10)
  const currentYear = today.getFullYear()
  const cutoffLabel = `${formatDate(cutoffStr)} – ${formatDate(todayStr)}`

  // Ločen akumulator na kategorijo
  const accByCat: Record<RangCategory, Record<string, PlayerAcc>> = {
    men: {}, women: {}, u18: {}, u14: {},
  }
  const seasonStatsByPlayer: Record<string, PlayerSeasonSummary[]> = {}

  function ensureAcc(cat: RangCategory, pid: string): PlayerAcc {
    const m = accByCat[cat]
    if (!m[pid]) m[pid] = {
      ligaRang: 0, dpPts: 0, totalPlayed: 0, totalMatchPointsFor: 0,
      ligaEntries: [], champEntries: [], clubName: null,
    }
    return m[pid]
  }

  // ── Liga sezone ───────────────────────────────────────────────────────────
  const { data: seasons, error: sErr } = await supabase
    .from('league_seasons')
    .select('id, name, tier, category, year, status, win_points, draw_points, loss_points, rounds_count')
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
      const cat = toRangCategory((season as { category?: string }).category)
      const playerStats = aggregatePlayerStats(matchResults, fixtures, disciplines)
      for (const ps of playerStats) {
        if (ps.totalPlayed === 0) continue
        const entry = calculateRang(ps, season.tier)

        // Povzetek po sezoni (za stran igralca — neodvisno od kategorije)
        if (!seasonStatsByPlayer[ps.playerId]) seasonStatsByPlayer[ps.playerId] = []
        seasonStatsByPlayer[ps.playerId].push({
          seasonId: season.id,
          seasonName: season.name,
          tier: season.tier,
          year: season.year,
          status: season.status,
          played: ps.totalPlayed,
          matchPointsFor: ps.totalMatchPointsFor,
          uspesnostPct: ps.totalPlayed > 0 ? ps.totalMatchPointsFor / (ps.totalPlayed * 2) : 0,
          rang: entry.rang,
          active: season.status === 'active',
        })

        // Rang akumulacija samo za eno od štirih kategorij
        if (!cat) continue
        const a = ensureAcc(cat, ps.playerId)
        a.ligaRang += entry.rang
        a.totalPlayed += entry.totalPlayed
        a.totalMatchPointsFor += entry.totalMatchPointsFor
        a.ligaEntries.push({ name: season.name, tier: season.tier, rang: entry.rang })
        if (!a.clubName && playerClub[ps.playerId]) a.clubName = playerClub[ps.playerId]
      }
    }
  }

  // ── Državna prvenstva ─────────────────────────────────────────────────────
  const yearOf = (date: string) => parseInt(String(date).slice(0, 4), 10)
  const { data: allChamps } = await supabase
    .from('tournaments')
    .select('id, name, date, category')
    .eq('kind', 'championship')
    .eq('status', 'completed')

  // MOŠKI: šteje le najnovejše leto DP — vsa 2025 veljajo, dokler ni prvega 2026
  // DP (potem se maxYear premakne na 2026 in 2025 padejo).
  // OSTALE kategorije: 365-dnevno okno.
  const menYears = (allChamps ?? [])
    .filter(c => toRangCategory((c as { category?: string }).category) === 'men')
    .map(c => yearOf(c.date))
  const menMaxYear = menYears.length ? Math.max(...menYears) : null

  const championships = (allChamps ?? []).filter(c => {
    const cat = toRangCategory((c as { category?: string }).category)
    if (!cat) return false
    if (cat === 'men') return yearOf(c.date) === menMaxYear
    return c.date >= cutoffStr && c.date <= todayStr
  })

  if (championships.length) {
    await Promise.all(championships.map(async champ => {
      const champCat = toRangCategory((champ as { category?: string }).category)!

      const { data: matches } = await supabase
        .from('matches')
        .select(`
          stage, winner_id, team_a_id, team_b_id,
          team_a:group_teams!matches_team_a_id_fkey(id, registration:tournament_registrations!group_teams_registration_id_fkey(player1_id, player2_id)),
          team_b:group_teams!matches_team_b_id_fkey(id, registration:tournament_registrations!group_teams_registration_id_fkey(player1_id, player2_id))
        `)
        .eq('tournament_id', champ.id)
        .in('stage', ['final', 'third_place', 'sf', 'qf', 'r16'])
        .eq('status', 'completed')

      type MatchRow = {
        stage: string; winner_id: string | null; team_a_id: string | null; team_b_id: string | null
        team_a: Array<{ id: string; registration: Array<{ player1_id: string; player2_id: string | null }> }>
        team_b: Array<{ id: string; registration: Array<{ player1_id: string; player2_id: string | null }> }>
      }
      const rows = (matches ?? []) as unknown as MatchRow[]

      // group_team id → igralci ekipe (dvojica = 2)
      const playersByTeam: Record<string, string[]> = {}
      const koMatches: ChampKoMatch[] = rows.map(m => {
        for (const gt of [m.team_a?.[0], m.team_b?.[0]]) {
          if (gt && !playersByTeam[gt.id]) {
            playersByTeam[gt.id] = [gt.registration?.[0]?.player1_id, gt.registration?.[0]?.player2_id]
              .filter(Boolean) as string[]
          }
        }
        return { stage: m.stage, winnerId: m.winner_id, teamAId: m.team_a_id, teamBId: m.team_b_id }
      })

      for (const award of championshipPoints(koMatches, playersByTeam)) {
        const a = ensureAcc(champCat, award.playerId)
        a.dpPts += award.pts
        a.champEntries.push({ champName: champ.name, placeLabel: award.placeLabel, pts: award.pts })
      }
    }))
  }

  // ── Razreši imena & klube (enkrat za vse kategorije) ──────────────────────
  const allIds = Array.from(new Set(
    RANG_CATEGORIES.flatMap(cat => Object.keys(accByCat[cat])),
  ))
  const uuidIds = allIds.filter(id => UUID_RE.test(id))
  const { data: users } = uuidIds.length > 0
    ? await supabase.from('users').select('id, full_name, club, role').in('id', uuidIds)
    : { data: [] }
  const playerUsers = (users ?? []).filter((u: { role?: string }) => u.role !== 'judge')
  const userMap = Object.fromEntries(playerUsers.map((u: { id: string; full_name: string | null; club: string | null }) => [u.id, u]))

  function buildRows(catAcc: Record<string, PlayerAcc>): RangRow[] {
    return Object.keys(catAcc)
      .filter(pid => catAcc[pid].totalPlayed > 0 || catAcc[pid].dpPts > 0)
      .map(pid => {
        const a = catAcc[pid]
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
      .filter(r => !!r.club)   // odstrani tekmovalce brez kluba (neregistrirani/prosto besedilo)
      .sort((a, b) => b.rang - a.rang || b.totalPlayed - a.totalPlayed)
  }

  const byCategory: Record<RangCategory, RangRow[]> = {
    men: buildRows(accByCat.men),
    women: buildRows(accByCat.women),
    u18: buildRows(accByCat.u18),
    u14: buildRows(accByCat.u14),
  }

  return { byCategory, seasonStatsByPlayer, cutoffLabel }
}
