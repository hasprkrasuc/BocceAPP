import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import type { UserProfile, PlayerStatistics, DoubleRegistration } from '../types'
import { isAgeEligible, calcAge, DR_STATUS_LABELS, DR_STATUS_COLORS, DR_TIER_LABELS } from '../engines/doubleRegistration'

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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('users').select('*').eq('id', id).single(),
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
    ]).then(([{ data: p }, { data: s }, { data: l }, { data: dr }]) => {
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
      setLoading(false)
    })
  }, [id])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-bocce-green" />
    </div>
  )
  if (!player) return <div className="text-center py-12 text-gray-400">Igralec ni najden</div>

  const birthYear = player.date_of_birth ? player.date_of_birth.slice(0, 4) : null
  const age = calcAge(player.date_of_birth)
  const drEligible = isAgeEligible(player.date_of_birth)
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

          {doubleRegs.length > 0 ? (
            <div className="space-y-2">
              {doubleRegs.map(dr => (
                <div key={dr.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
                  <div className="flex-1 text-sm">
                    <span className="text-gray-600">Primarni klub:</span>{' '}
                    <span className="font-medium">{(dr.primary_team as any)?.club_name}</span>
                    {(dr.primary_team as any)?.season?.tier && (
                      <span className="text-xs text-gray-400 ml-1">
                        ({DR_TIER_LABELS[(dr.primary_team as any).season.tier] ?? ''})
                      </span>
                    )}
                    <span className="mx-2 text-gray-300">→</span>
                    <span className="font-medium">{(dr.secondary_team as any)?.club_name}</span>
                    {(dr.secondary_team as any)?.season?.tier && (
                      <span className="text-xs text-gray-400 ml-1">
                        ({DR_TIER_LABELS[(dr.secondary_team as any).season.tier] ?? ''})
                      </span>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${DR_STATUS_COLORS[dr.status]}`}>
                    {DR_STATUS_LABELS[dr.status]}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Ni oddane vloge za dvojno registracijo.</p>
              {isAdmin && (
                <Link to="/admin/dvojna-registracija"
                  className="text-xs bg-bocce-green text-white px-3 py-1.5 rounded-lg hover:bg-bocce-green-light transition-colors">
                  Upravljaj →
                </Link>
              )}
            </div>
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

      {stats.length === 0 && leagues.length === 0 && (
        <div className="text-center py-8 text-gray-400 italic bg-white border border-gray-200 rounded-2xl">
          Ni zabeležene statistike
        </div>
      )}
    </div>
  )
}
