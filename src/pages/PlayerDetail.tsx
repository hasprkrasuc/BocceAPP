import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { USER_PUBLIC_COLS } from '../lib/userColumns'
import { useAuth } from '../contexts/AuthContext'
import type { UserProfile, PlayerStatistics, DoubleRegistration } from '../types'
import { isAgeEligible, calcAge, isFemale, eligibleSecondaryTeams, latestSeasonsOnly, primaryTeams, birthYearOf, DR_STATUS_LABELS, DR_STATUS_COLORS, DR_TIER_LABELS } from '../engines/doubleRegistration'
import { computeRangLestvica, RANG_CATEGORY_LABELS, type PlayerSeasonSummary, type RangCategory } from '../lib/rangLestvica'
import { findPlayerRankInCategories, type CategoryPlayerRank } from '../lib/findPlayerRank'

interface LeagueEntry {
  id: string
  season: { name: string; year: number; category: string }
  team: { club_name: string }
}

export default function PlayerDetail() {
  const { id } = useParams<{ id: string }>()
  const { isAdmin } = useAuth()
  const [player, setPlayer] = useState<UserProfile | null>(null)
  const [stats, setStats] = useState<PlayerStatistics[]>([])
  const [leagues, setLeagues] = useState<LeagueEntry[]>([])
  const [doubleRegs, setDoubleRegs] = useState<DoubleRegistration[]>([])
  const [eligibleTeams, setEligibleTeams] = useState<{ id: string; club_name: string; tier: string; season_id: string }[]>([])
  const [myTeams, setMyTeams] = useState<{ id: string; tier: string; season_id: string }[]>([])
  const [selectedSecondary, setSelectedSecondary] = useState('')
  const [drSubmitting, setDrSubmitting] = useState(false)
  const [drMsg, setDrMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [rankInfo, setRankInfo] = useState<CategoryPlayerRank | null>(null)
  const [seasonStats, setSeasonStats] = useState<PlayerSeasonSummary[]>([])
  const [rangLoading, setRangLoading] = useState(true)

  // Skupni rang + statistika aktualnih sezon (iz deljenega izračuna rang lestvice)
  useEffect(() => {
    if (!id) return
    setRangLoading(true)
    computeRangLestvica()
      .then(({ byCategory, seasonStatsByPlayer }) => {
        setRankInfo(findPlayerRankInCategories(byCategory, id))
        setSeasonStats(seasonStatsByPlayer[id] ?? [])
      })
      .catch(() => { setRankInfo(null); setSeasonStats([]) })
      .finally(() => setRangLoading(false))
  }, [id])

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('users').select(USER_PUBLIC_COLS).eq('id', id).single(),
      supabase.from('player_statistics').select('*').eq('player_id', id).order('year', { ascending: false }),
      supabase
        .from('league_team_players')
        .select('id, league_team:league_teams(club_name, season:league_seasons(name, year, category))')
        .eq('player_id', id),
      supabase
        .from('double_registrations')
        .select('*, primary_team:league_teams!primary_team_id(club_name, season:league_seasons(name,tier)), secondary_team:league_teams!secondary_team_id(club_name, season:league_seasons(name,tier))')
        .eq('player_id', id)
        .order('requested_at', { ascending: false }),
    ]).then(async ([{ data: p }, { data: s }, { data: l }, { data: dr }]) => {
      setPlayer(p as UserProfile)
      setStats((s ?? []) as PlayerStatistics[])
      const entries: LeagueEntry[] = ((l ?? []) as any[])
        .filter(r => r.league_team?.season)
        .map(r => ({
          id: r.id,
          season: r.league_team.season,
          team: { club_name: r.league_team.club_name },
        }))
        .sort((a, b) => b.season.year - a.season.year)
      setLeagues(entries)
      setDoubleRegs((dr ?? []) as DoubleRegistration[])

      // Ekipe za dvojno reg (admin) — spolno-zavedno (moški / ženske).
      // Vedno najnovejša sezona, tudi če je že zaključena. Pri ženskah je
      // primarna lahko katerakoli njena ekipa (tudi U18 — klub pogosto nima
      // ženske ekipe).
      const playerGender = (p as UserProfile)?.gender
      const { data: tpData } = await supabase
        .from('league_team_players')
        .select('league_team_id, league_teams(id, club_name, season_id, season:league_seasons(id, tier, year, category))')
        .eq('player_id', (p as UserProfile)?.id ?? id)
      const playerTeams = latestSeasonsOnly(primaryTeams(playerGender,
        ((tpData ?? []) as any[]).map(tp => tp.league_teams).filter(Boolean)))
      setMyTeams(playerTeams.map((t: any) => ({ id: t.id, tier: t.season.tier, season_id: t.season_id })))

      const { data: allTeams } = await supabase
        .from('league_teams')
        .select('id, club_name, season:league_seasons(id, tier, year, category)')
      const candidates = latestSeasonsOnly(((allTeams ?? []) as any[]).filter(t => t?.season))
      const eligibleRefs = eligibleSecondaryTeams(
        playerGender,
        playerTeams.map((t: any) => ({ id: t.id, tier: t.season?.tier, category: t.season?.category })),
        candidates.map((t: any) => ({ id: t.id, tier: t.season?.tier, category: t.season?.category })),
      )
      const eligibleIds = new Set(eligibleRefs.map(r => r.id))
      setEligibleTeams(candidates
        .filter((t: any) => eligibleIds.has(t.id))
        .map((t: any) => ({ id: t.id, club_name: t.club_name, tier: t.season?.tier, season_id: t.season?.id })))

      setLoading(false)
    })
  }, [id])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-bocce-green" />
    </div>
  )
  if (!player) return <div className="text-center py-12 text-gray-400">Igralec ni najden</div>

  const birthYear = birthYearOf(player.date_of_birth)
  const age = calcAge(player.date_of_birth)
  const drEligible = isAgeEligible(player.date_of_birth)

  // Prikaži aktivne sezone; če jih ni (aktualna sezona je zaključena), zadnjo zaključeno
  const activeSeasons = seasonStats.filter(s => s.active)
  const showActive = activeSeasons.length > 0
  const displaySeasons = showActive
    ? activeSeasons
    : (() => {
        const completed = seasonStats.filter(s => s.status === 'completed')
        if (!completed.length) return []
        const maxYear = Math.max(...completed.map(s => s.year))
        return completed.filter(s => s.year === maxYear)
      })()
  const seasonCardTitle = showActive ? 'Aktualna sezona' : 'Zadnja sezona'

  async function approveDoubleReg() {
    if (!selectedSecondary || myTeams.length === 0) return
    setDrSubmitting(true); setDrMsg('')
    const primaryTeam = myTeams[0]
    const secTeam = eligibleTeams.find(t => t.id === selectedSecondary)
    // 1. Ustvari zapis dvojne registracije (že odobreno)
    const { error: drErr } = await supabase.from('double_registrations').insert({
      player_id:          player.id,
      primary_team_id:    primaryTeam.id,
      secondary_team_id:  selectedSecondary,
      season_id:          secTeam?.season_id ?? primaryTeam.season_id,
      status:             'approved',
      resolved_at:        new Date().toISOString(),
    })
    if (drErr) { setDrMsg(`❌ ${drErr.message}`); setDrSubmitting(false); return }
    // 2. Dodaj v league_team_players sekundarne ekipe
    const { error: ltpErr } = await supabase.from('league_team_players').insert({
      league_team_id: selectedSecondary,
      player_id:      player.id,
    })
    if (ltpErr) { setDrMsg(`❌ ${ltpErr.message}`); setDrSubmitting(false); return }
    setDrMsg(`✓ Dvojna registracija odobrena za ${secTeam?.club_name}`)
    setSelectedSecondary('')
    // Osveži seznam
    const { data: dr } = await supabase
      .from('double_registrations')
      .select('*, primary_team:league_teams!primary_team_id(club_name, season:league_seasons(name,tier)), secondary_team:league_teams!secondary_team_id(club_name, season:league_seasons(name,tier))')
      .eq('player_id', player.id).order('requested_at', { ascending: false })
    setDoubleRegs((dr ?? []) as DoubleRegistration[])
    setDrSubmitting(false)
  }
  const categoryLabel: Record<string, string> = {
    men: 'Člani', women: 'Članice', u18: 'U-18', u18_women: 'U-18 ž.', u15: 'U-15', u12: 'U-12',
  }

  const totalStats = stats.reduce((acc, s) => ({
    tournaments: acc.tournaments + s.tournaments_played,
    won: acc.won + s.matches_won,
    lost: acc.lost + s.matches_lost,
    points: acc.points + s.points_scored,
    titles: acc.titles + s.titles,
    podiums: acc.podiums + s.podiums,
  }), { tournaments: 0, won: 0, lost: 0, points: 0, titles: 0, podiums: 0 })

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link to={player.club_id ? `/klubi/${player.club_id}` : '/klubi'}
        className="inline-block text-sm text-bocce-green hover:underline mb-4">
        ← {player.club ?? 'Klubi'}
      </Link>

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 flex items-start gap-6 flex-wrap">
        {player.photo_url ? (
          <img src={player.photo_url} alt={player.full_name ?? ''}
            className="w-28 h-28 rounded-xl object-cover border border-gray-200 flex-shrink-0" />
        ) : (
          <div className="w-28 h-28 rounded-xl bg-bocce-green/10 flex items-center justify-center text-4xl font-bold text-bocce-green flex-shrink-0">
            {(player.full_name ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-800 mb-3">{player.full_name}</h1>
          <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
            {player.license_number && (
              <>
                <dt className="text-gray-500">Številka licence</dt>
                <dd className="font-medium text-gray-800">{player.license_number}</dd>
              </>
            )}
            {birthYear && (
              <>
                <dt className="text-gray-500">Leto rojstva</dt>
                <dd className="font-medium text-gray-800">{birthYear}</dd>
              </>
            )}
            {player.club && (
              <>
                <dt className="text-gray-500">Matični klub</dt>
                <dd className="font-medium text-gray-800">
                  {player.club_id
                    ? <Link to={`/klubi/${player.club_id}`} className="text-bocce-green hover:underline">{player.club}</Link>
                    : player.club}
                </dd>
              </>
            )}
            {player.gender && (
              <>
                <dt className="text-gray-500">Spol</dt>
                <dd className="font-medium text-gray-800">{player.gender === 'M' ? 'Moški' : 'Ženska'}</dd>
              </>
            )}
          </dl>
        </div>
      </div>

      {/* Aktualna sezona + skupni rang */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="text-lg font-semibold text-gray-800">{seasonCardTitle}</h2>
          {rangLoading ? (
            <span className="text-xs text-gray-400">Nalagam rang…</span>
          ) : rankInfo ? (
            <Link to="/rang"
              className="text-sm bg-bocce-green/10 text-bocce-green border border-bocce-green/20 px-3 py-1.5 rounded-full font-medium hover:bg-bocce-green/20 transition-colors">
              Rang {RANG_CATEGORY_LABELS[rankInfo.category as RangCategory]}: <strong>#{rankInfo.mesto}</strong> · {rankInfo.rang.toFixed(2)} t
            </Link>
          ) : (
            <span className="text-xs text-gray-400">Ni uvrščen na rang lestvici</span>
          )}
        </div>

        {displaySeasons.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-600">
                  <th className="py-2 pr-4 font-semibold">Liga</th>
                  <th className="py-2 pr-4 font-semibold text-right">Možne</th>
                  <th className="py-2 pr-4 font-semibold text-right">Točke</th>
                  <th className="py-2 pr-4 font-semibold text-right">Uspešnost</th>
                  <th className="py-2 font-semibold text-right">Rang</th>
                </tr>
              </thead>
              <tbody>
                {displaySeasons.map(s => (
                  <tr key={s.seasonId} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5 pr-4 font-medium text-gray-800">
                      <Link to={`/liga/${s.seasonId}`} className="hover:text-bocce-green">{s.seasonName}</Link>
                    </td>
                    <td className="py-2.5 pr-4 text-right text-gray-700">{s.played * 2}</td>
                    <td className="py-2.5 pr-4 text-right font-semibold text-gray-800">{s.matchPointsFor}</td>
                    <td className="py-2.5 pr-4 text-right text-gray-700">{(s.uspesnostPct * 100).toFixed(0)} %</td>
                    <td className="py-2.5 text-right font-semibold text-bocce-green">{s.rang.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">
            {rangLoading ? 'Nalagam…' : 'Ni ligaške statistike.'}
          </p>
        )}
      </div>

      {/* League history */}
      {leagues.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Ligaška pot</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 pr-6 font-semibold text-gray-600">Sezona</th>
                  <th className="text-left py-2 pr-6 font-semibold text-gray-600">Klub</th>
                  <th className="text-left py-2 font-semibold text-gray-600">Kategorija</th>
                </tr>
              </thead>
              <tbody>
                {leagues.map(e => (
                  <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5 pr-6 text-gray-700">{e.season.name}</td>
                    <td className="py-2.5 pr-6 text-gray-800 font-medium">{e.team.club_name}</td>
                    <td className="py-2.5 text-gray-500">{categoryLabel[e.season.category] ?? e.season.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dvojna registracija */}
      {(drEligible || doubleRegs.length > 0) && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Dvojna registracija</h2>
            {drEligible && (
              <span className="text-xs bg-bocce-green/10 text-bocce-green border border-bocce-green/20 px-2.5 py-1 rounded-full font-medium">
                ✓ Upravičen ({age} let)
              </span>
            )}
          </div>

          {/* Obstoječe dvojne registracije */}
          {doubleRegs.length > 0 && (
            <div className="space-y-2 mb-4">
              {doubleRegs.map(dr => (
                <div key={dr.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
                  <div className="flex-1 text-sm">
                    <span className="font-medium">{(dr.primary_team as any)?.club_name}</span>
                    <span className="text-xs text-gray-400 ml-1">({DR_TIER_LABELS[(dr.primary_team as any)?.season?.tier ?? ''] ?? ''})</span>
                    <span className="mx-2 text-gray-300">→</span>
                    <span className="font-medium">{(dr.secondary_team as any)?.club_name}</span>
                    <span className="text-xs text-gray-400 ml-1">({DR_TIER_LABELS[(dr.secondary_team as any)?.season?.tier ?? ''] ?? ''})</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${DR_STATUS_COLORS[dr.status]}`}>
                    {DR_STATUS_LABELS[dr.status]}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Admin: dodaj dvojno registracijo */}
          {isAdmin && drEligible && myTeams.length > 0 && eligibleTeams.length > 0 && (
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dodaj dvojno registracijo</p>
              <div className="flex gap-2">
                <select
                  value={selectedSecondary}
                  onChange={e => setSelectedSecondary(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none"
                >
                  <option value="">— Izberi sekundarno ekipo —</option>
                  {eligibleTeams.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.club_name} ({DR_TIER_LABELS[t.tier] ?? t.tier})
                    </option>
                  ))}
                </select>
                <button
                  onClick={approveDoubleReg}
                  disabled={!selectedSecondary || drSubmitting}
                  className="bg-bocce-green text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-bocce-green-light transition-colors shrink-0"
                >
                  {drSubmitting ? '...' : '🔄 Dodeli'}
                </button>
              </div>
              {drMsg && (
                <p className={`text-sm rounded-lg px-3 py-2 ${drMsg.startsWith('❌') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                  {drMsg}
                </p>
              )}
            </div>
          )}

          {isAdmin && drEligible && myTeams.length === 0 && (
            <p className="text-sm text-gray-400 italic">
              {isFemale(player.gender)
                ? 'Igralka ni v nobeni ženski ekipi tekoče sezone.'
                : 'Igralec ni v nobeni moški ekipi tekoče sezone.'}
            </p>
          )}
        </div>
      )}

      {/* Statistics */}
      {stats.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Statistika turnirjev</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 pr-4 font-semibold text-gray-600">Leto</th>
                  <th className="text-right py-2 pr-4 font-semibold text-gray-600">Turnirji</th>
                  <th className="text-right py-2 pr-4 font-semibold text-gray-600">Zmage</th>
                  <th className="text-right py-2 pr-4 font-semibold text-gray-600">Porazi</th>
                  <th className="text-right py-2 pr-4 font-semibold text-gray-600">Točke</th>
                  <th className="text-right py-2 pr-4 font-semibold text-gray-600">Naslovi</th>
                  <th className="text-right py-2 font-semibold text-gray-600">Podiumi</th>
                </tr>
              </thead>
              <tbody>
                {stats.map(s => (
                  <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5 pr-4 font-medium text-gray-800">{s.year}</td>
                    <td className="py-2.5 pr-4 text-right text-gray-700">{s.tournaments_played}</td>
                    <td className="py-2.5 pr-4 text-right text-gray-700">{s.matches_won}</td>
                    <td className="py-2.5 pr-4 text-right text-gray-700">{s.matches_lost}</td>
                    <td className="py-2.5 pr-4 text-right text-gray-700">{s.points_scored}</td>
                    <td className="py-2.5 pr-4 text-right text-bocce-gold font-semibold">{s.titles || '—'}</td>
                    <td className="py-2.5 text-right text-gray-700">{s.podiums || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 font-semibold bg-gray-50">
                  <td className="py-2.5 pr-4 text-gray-700">Skupaj</td>
                  <td className="py-2.5 pr-4 text-right text-gray-800">{totalStats.tournaments}</td>
                  <td className="py-2.5 pr-4 text-right text-gray-800">{totalStats.won}</td>
                  <td className="py-2.5 pr-4 text-right text-gray-800">{totalStats.lost}</td>
                  <td className="py-2.5 pr-4 text-right text-gray-800">{totalStats.points}</td>
                  <td className="py-2.5 pr-4 text-right text-bocce-gold">{totalStats.titles || '—'}</td>
                  <td className="py-2.5 text-right text-gray-800">{totalStats.podiums || '—'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}
