/**
 * RANG LESTVICA — liga + državna prvenstva, zadnjih 365 dni
 *
 * Liga rang:
 *   rang = weightedMatchPoints × ligaKoef × uspesnostPct
 *   discWeight: posamezno/krog 100%, dvojka 75%, ostalo 50%
 *   ligaKoef: Super liga 1.3 | 1. liga 1.0 | 2. liga 0.8
 *   uspesnostPct = matchPointsFor / (played × 2)
 *
 * Državna prvenstva (točke po uvrstitvi):
 *   1. mesto 16 | 2. mesto 10 | 3. mesto 8 | 4. mesto 7
 *   5.–8. mesto 3 | 9.–16. mesto 1
 *
 * Skupni rang = ligaRang + dpTočke
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { aggregatePlayerStats, calculateRang, LIGA_KOEF, DEFAULT_LIGA_KOEF } from '../engines/leagueStats'
import type {
  LeagueFixture,
  LeagueMatchResult,
  LeagueMatchDisciplineResult,
  LeagueSeasonDiscipline,
} from '../types'

// ─── Constants ────────────────────────────────────────────────────────────────

const TIER_LABELS: Record<string, string> = {
  super_liga:      'Super liga',
  '1_liga':        '1. liga',
  '2_liga_zahod':  '2. liga zahod',
  '2_liga_vzhod':  '2. liga vzhod',
}

/** Points awarded to the LOSER of a knockout stage (losers exit the tournament) */
const STAGE_LOSER_PTS: Record<string, { pts: number; placeLabel: string }> = {
  qf:  { pts: 3, placeLabel: '5.–8. mesto' },
  r16: { pts: 1, placeLabel: '9.–16. mesto' },
}

/** Points for finalist stages (both winner and loser get something) */
const STAGE_FINAL_PTS = {
  final:       { winner: 16, loser: 10, winnerPlace: '1. mesto', loserPlace: '2. mesto' },
  third_place: { winner: 8,  loser: 7,  winnerPlace: '3. mesto', loserPlace: '4. mesto' },
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChampEntry {
  champName: string
  placeLabel: string
  pts: number
}

interface LigaEntry {
  name: string
  tier: string
  rang: number
}

interface RangRow {
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${parseInt(d)}. ${parseInt(m)}. ${y}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LeagueRanking() {
  const [rows, setRows]               = useState<RangRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [expanded, setExpanded]       = useState<string | null>(null)
  const [cutoffLabel, setCutoffLabel] = useState<string>('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      // ── 1. Rolling 365-day window ─────────────────────────────────────────
      const today = new Date()
      const cutoff = new Date(today)
      cutoff.setFullYear(cutoff.getFullYear() - 1)
      const cutoffStr  = cutoff.toISOString().slice(0, 10)
      const todayStr   = today.toISOString().slice(0, 10)
      const currentYear = today.getFullYear()

      setCutoffLabel(`${formatDate(cutoffStr)} – ${formatDate(todayStr)}`)

      // ── 2. Accumulator ───────────────────────────────────────────────────
      type PlayerAcc = {
        ligaRang:            number
        dpPts:               number
        totalPlayed:         number
        totalMatchPointsFor: number
        ligaEntries:         LigaEntry[]
        champEntries:        ChampEntry[]
        clubName:            string | null   // best club name found (from team or profile)
      }
      const acc: Record<string, PlayerAcc> = {}

      function ensureAcc(pid: string) {
        if (!acc[pid]) acc[pid] = {
          ligaRang: 0, dpPts: 0,
          totalPlayed: 0, totalMatchPointsFor: 0,
          ligaEntries: [], champEntries: [],
          clubName: null,
        }
      }

      // ── 3. Liga seasons ──────────────────────────────────────────────────
      const { data: seasons, error: sErr } = await supabase
        .from('league_seasons')
        .select('id, name, tier, year, win_points, draw_points, loss_points, rounds_count')
        .gte('year', currentYear - 2)
        .order('year', { ascending: false })

      if (sErr) throw sErr

      if (seasons?.length) {
        type SeasonBundle = {
          season: typeof seasons[0]
          fixtures:     LeagueFixture[]
          disciplines:  LeagueSeasonDiscipline[]
          matchResults: Array<LeagueMatchResult & { discipline_results?: LeagueMatchDisciplineResult[] }>
          playerClub:   Record<string, string>   // playerId → club_name
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
              // Fetch teams with their player rosters for club lookup
              supabase
                .from('league_teams')
                .select('club_name, league_team_players(player_id)')
                .eq('season_id', season.id),
            ])

            const fixtureIds = (fixtures ?? []).map(f => f.id)

            const [{ data: disciplines }, { data: matchResults }] = await Promise.all([
              supabase.from('league_season_disciplines').select('*').eq('season_id', season.id),
              fixtureIds.length > 0
                ? supabase
                    .from('league_match_results')
                    .select('*, discipline_results:league_match_discipline_results(*)')
                    .in('fixture_id', fixtureIds)
                : Promise.resolve({ data: [] as unknown[] }),
            ])

            // Build playerId → club_name map from roster data
            const playerClub: Record<string, string> = {}
            for (const team of (teamData ?? []) as Array<{ club_name: string; league_team_players: Array<{ player_id: string }> }>) {
              for (const tp of (team.league_team_players ?? [])) {
                if (tp.player_id) playerClub[tp.player_id] = team.club_name
              }
            }

            return {
              season,
              fixtures:     (fixtures     ?? []) as LeagueFixture[],
              disciplines:  (disciplines  ?? []) as LeagueSeasonDiscipline[],
              matchResults: (matchResults ?? []) as Array<LeagueMatchResult & { discipline_results?: LeagueMatchDisciplineResult[] }>,
              playerClub,
            }
          })
        )

        for (const { season, fixtures, disciplines, matchResults, playerClub } of bundles) {
          const playerStats = aggregatePlayerStats(matchResults, fixtures, disciplines)
          for (const ps of playerStats) {
            if (ps.totalPlayed === 0) continue
            const entry = calculateRang(ps, season.tier)
            ensureAcc(ps.playerId)
            acc[ps.playerId].ligaRang            += entry.rang
            acc[ps.playerId].totalPlayed         += entry.totalPlayed
            acc[ps.playerId].totalMatchPointsFor += entry.totalMatchPointsFor
            acc[ps.playerId].ligaEntries.push({ name: season.name, tier: season.tier, rang: entry.rang })
            // Set club from team roster (prefer over null)
            if (!acc[ps.playerId].clubName && playerClub[ps.playerId]) {
              acc[ps.playerId].clubName = playerClub[ps.playerId]
            }
          }
        }
      }

      // ── 4. Državna prvenstva ─────────────────────────────────────────────
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
                id,
                registration:tournament_registrations!group_teams_registration_id_fkey(player1_id, player2_id)
              ),
              team_b:group_teams!matches_team_b_id_fkey(
                id,
                registration:tournament_registrations!group_teams_registration_id_fkey(player1_id, player2_id)
              )
            `)
            .eq('tournament_id', champ.id)
            .in('stage', ['final', 'third_place', 'qf', 'r16'])
            .eq('status', 'completed')

          type MatchRow = {
            stage: string; winner_id: string | null; is_bye: boolean
            team_a_id: string | null; team_b_id: string | null
            // Supabase returns joined rows as arrays even for FK relations
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
              awardPts(loserId,         STAGE_FINAL_PTS.final.loser,  STAGE_FINAL_PTS.final.loserPlace)
            } else if (match.stage === 'third_place') {
              awardPts(match.winner_id, STAGE_FINAL_PTS.third_place.winner, STAGE_FINAL_PTS.third_place.winnerPlace)
              awardPts(loserId,         STAGE_FINAL_PTS.third_place.loser,  STAGE_FINAL_PTS.third_place.loserPlace)
            } else if (!match.is_bye) {
              // QF and R16: only the loser gets points (winner advances)
              const stagePts = STAGE_LOSER_PTS[match.stage]
              if (stagePts) awardPts(loserId, stagePts.pts, stagePts.placeLabel)
            }
          }
        }))
      }

      // ── 5. Resolve names & clubs ─────────────────────────────────────────
      const allIds = Object.keys(acc)
      if (!allIds.length) { setRows([]); setLoading(false); return }

      const uuidIds = allIds.filter(id => UUID_RE.test(id))
      // Only fetch players (not judges) — judges shouldn't appear in rang lestvica
      const { data: users } = uuidIds.length > 0
        ? await supabase.from('users').select('id, full_name, club, role').in('id', uuidIds)
        : { data: [] }
      const playerUsers = (users ?? []).filter((u: { role?: string }) => u.role !== 'judge')
      const userMap = Object.fromEntries(playerUsers.map((u: { id: string; full_name: string | null; club: string | null }) => [u.id, u]))

      // ── 6. Build rows ────────────────────────────────────────────────────
      const result: RangRow[] = allIds
        .filter(pid => {
          const a = acc[pid]
          return a.totalPlayed > 0 || a.dpPts > 0
        })
        .map(pid => {
          const a = acc[pid]
          const isUuid = UUID_RE.test(pid)
          const user = isUuid ? userMap[pid] : null
          const totalPossible = a.totalPlayed * 2
          // Club: prefer from team roster, fallback to user profile
          const club = a.clubName ?? user?.club ?? null
          return {
            playerId:    pid,
            displayName: user?.full_name ?? (isUuid ? `?? ${pid.slice(0, 8)}` : pid),
            club,
            rang:        a.ligaRang + a.dpPts,
            ligaRang:    a.ligaRang,
            dpPts:       a.dpPts,
            totalPlayed: a.totalPlayed,
            totalMatchPointsFor: a.totalMatchPointsFor,
            uspesnostPct: totalPossible > 0 ? a.totalMatchPointsFor / totalPossible : 0,
            isUuid,
            ligaEntries:  a.ligaEntries.sort((x, y) => y.rang - x.rang),
            champEntries: a.champEntries.sort((x, y) => y.pts - x.pts),
          }
        })
        .sort((a, b) => b.rang - a.rang || b.totalPlayed - a.totalPlayed)

      setRows(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Napaka pri nalaganju')
    } finally {
      setLoading(false)
    }
  }

  const toggleExpand = (id: string) => setExpanded(prev => prev === id ? null : id)

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Rang lestvica</h1>
        <p className="text-sm text-gray-500 mt-1">
          Ligaški rang + državna prvenstva
          {cutoffLabel && (
            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 bg-bocce-green/10 text-bocce-green rounded-full text-xs font-medium">
              📅 {cutoffLabel}
            </span>
          )}
        </p>
      </div>

      {/* Formula legend */}
      <div className="bg-bocce-green/5 border border-bocce-green/20 rounded-xl px-4 py-3 mb-6 text-xs text-gray-600 space-y-2">
        <div>
          <span className="font-semibold text-gray-700">Liga:</span>
          {' '}rang = utežene točke × koef. lige × % uspešnosti
          <span className="ml-3 text-gray-500">
            (Posamezno/krog 100 % · Dvojka 75 % · Ostalo 50 %)
          </span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {Object.entries(LIGA_KOEF).map(([k, v]) => (
            <span key={k}><strong>{TIER_LABELS[k] ?? k}:</strong> {v}</span>
          ))}
          <span><strong>Ostale:</strong> {DEFAULT_LIGA_KOEF}</span>
        </div>
        <div>
          <span className="font-semibold text-gray-700">Državna prvenstva:</span>
          <span className="ml-2 text-gray-500">
            1. m. 16 · 2. m. 10 · 3. m. 8 · 4. m. 7 · 5.–8. m. 3 · 9.–16. m. 1
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5,6,7,8].map(i => (
            <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-gray-400 italic">
          Ni podatkov za rang lestvico
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-bocce-green text-white text-xs uppercase tracking-wide">
                <th className="px-3 py-3 text-left w-8">#</th>
                <th className="px-3 py-3 text-left">Igralec</th>
                <th className="px-3 py-3 text-left hidden sm:table-cell">Klub</th>
                <th className="px-3 py-3 text-right hidden md:table-cell" title="Liga odigrane discipline">Odigr.</th>
                <th className="px-3 py-3 text-right hidden md:table-cell" title="% uspešnosti v ligah">% usp.</th>
                <th className="px-3 py-3 text-right" title="Liga rang">Liga</th>
                <th className="px-3 py-3 text-right" title="DP točke">DP</th>
                <th className="px-3 py-3 text-right font-bold" title="Skupni rang">Rang</th>
                <th className="px-3 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <>
                  <tr
                    key={row.playerId}
                    className={`border-b border-gray-100 hover:bg-bocce-green/5 transition-colors cursor-pointer ${
                      i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                    }`}
                    onClick={() => toggleExpand(row.playerId)}
                  >
                    {/* Rank */}
                    <td className="px-3 py-2.5 text-center">
                      {i === 0 ? <span className="text-bocce-gold font-bold text-base">🥇</span>
                      : i === 1 ? <span className="text-gray-400 font-bold text-base">🥈</span>
                      : i === 2 ? <span className="text-amber-600 font-bold text-base">🥉</span>
                      : <span className="text-gray-400">{i + 1}</span>}
                    </td>

                    {/* Name */}
                    <td className="px-3 py-2.5">
                      {row.isUuid ? (
                        <Link to={`/igraci/${row.playerId}`}
                          className="font-medium text-gray-800 hover:text-bocce-green"
                          onClick={e => e.stopPropagation()}>
                          {row.displayName}
                        </Link>
                      ) : (
                        <span className="font-medium text-gray-600 italic"
                          title="Vnesen kot prosto besedilo — ni v registru">
                          {row.displayName}
                        </span>
                      )}
                    </td>

                    {/* Club */}
                    <td className="px-3 py-2.5 text-gray-500 hidden sm:table-cell">
                      {row.club ?? '—'}
                    </td>

                    {/* Played */}
                    <td className="px-3 py-2.5 text-right text-gray-600 hidden md:table-cell">
                      {row.totalPlayed > 0 ? `${row.totalMatchPointsFor}/${row.totalPlayed * 2}` : '—'}
                    </td>

                    {/* Success % */}
                    <td className="px-3 py-2.5 text-right hidden md:table-cell">
                      {row.totalPlayed > 0 ? (
                        <span className={`font-medium ${
                          row.uspesnostPct >= 0.7 ? 'text-bocce-green' :
                          row.uspesnostPct >= 0.5 ? 'text-yellow-600' : 'text-red-500'
                        }`}>
                          {(row.uspesnostPct * 100).toFixed(1)} %
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Liga rang */}
                    <td className="px-3 py-2.5 text-right text-gray-500">
                      {row.ligaRang > 0 ? row.ligaRang.toFixed(2) : <span className="text-gray-300">—</span>}
                    </td>

                    {/* DP pts */}
                    <td className="px-3 py-2.5 text-right text-bocce-gold font-medium">
                      {row.dpPts > 0 ? `+${row.dpPts}` : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Total rang */}
                    <td className="px-3 py-2.5 text-right font-bold">
                      {row.rang > 0
                        ? <span className="text-bocce-green">{row.rang.toFixed(2)}</span>
                        : <span className="text-gray-300">0.00</span>}
                    </td>

                    {/* Expand toggle */}
                    <td className="px-3 py-2.5 text-center text-gray-400 text-xs">
                      {expanded === row.playerId ? '▲' : '▼'}
                    </td>
                  </tr>

                  {/* Expanded breakdown */}
                  {expanded === row.playerId && (
                    <tr key={`${row.playerId}-exp`} className="bg-bocce-green/5">
                      <td colSpan={9} className="px-6 py-3">
                        <div className="grid sm:grid-cols-2 gap-4 text-xs text-gray-600">
                          {/* Liga contributions */}
                          {row.ligaEntries.length > 0 && (
                            <div>
                              <p className="font-semibold text-gray-700 mb-2">Liga rang</p>
                              <div className="space-y-1">
                                {row.ligaEntries.map(s => (
                                  <div key={s.name} className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded bg-bocce-green/10 text-bocce-green font-medium">
                                      {TIER_LABELS[s.tier] ?? s.tier}
                                    </span>
                                    <span className="text-gray-700 truncate">{s.name}</span>
                                    <span className="ml-auto font-bold text-bocce-green shrink-0">
                                      +{s.rang.toFixed(2)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Championship contributions */}
                          {row.champEntries.length > 0 && (
                            <div>
                              <p className="font-semibold text-gray-700 mb-2">Državna prvenstva</p>
                              <div className="space-y-1">
                                {row.champEntries.map((c, ci) => (
                                  <div key={ci} className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded bg-bocce-gold/20 text-yellow-700 font-medium shrink-0">
                                      {c.placeLabel}
                                    </span>
                                    <span className="text-gray-700 truncate">{c.champName}</span>
                                    <span className="ml-auto font-bold text-bocce-gold shrink-0">
                                      +{c.pts}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <p className="text-xs text-gray-400 mt-4 text-right">
          {rows.length} igralcev · zadnjih 365 dni · klikni vrstico za razčlenitev
        </p>
      )}
    </div>
  )
}
