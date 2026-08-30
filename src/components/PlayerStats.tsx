import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import type { PlayerStatistics } from '../types'
import {
  computeRangLestvica, computePlayerSeasonStats, RANG_CATEGORY_LABELS,
  type PlayerSeasonSummary, type RangCategory,
} from '../lib/rangLestvica'
import { findPlayerRankInCategories, type CategoryPlayerRank } from '../lib/findPlayerRank'

/**
 * Statistika enega igralca: sezone z rangom, ligaška pot in turnirji.
 *
 * Isti prikaz uporabljata javna kartica igralca (`/igraci/:id`) in lasten
 * profil (`/profil`). Prej je živel samo v kartici; ko so ga hoteli še na
 * profilu, je bil edini pošten izhod ena komponenta — dva izvoda istega
 * izračuna bi se prej ali slej razšla.
 *
 * Rang se nalaga LOČENO od ostalega. `computeRangLestvica()` prebere vse
 * sezone zadnjih treh let in je krepko najdražji del strani; če bi visel v
 * istem `Promise.all`, bi tabela sezon čakala nanj, čeprav je zanjo dovolj
 * `computePlayerSeasonStats()`.
 */

const KATEGORIJA_LABELS: Record<string, string> = {
  men: 'Člani', women: 'Članice', u18: 'U-18', u18_women: 'U-18 ž.', u15: 'U-15', u14: 'U-14', u12: 'U-12',
}

interface LigaskaPot {
  id: string
  season: { name: string; year: number; category: string }
  team: { club_name: string }
}

export default function PlayerStats({ playerId }: { playerId: string }) {
  const [sezone, setSezone] = useState<PlayerSeasonSummary[]>([])
  const [pot, setPot] = useState<LigaskaPot[]>([])
  const [turnirji, setTurnirji] = useState<PlayerStatistics[]>([])
  const [nalagam, setNalagam] = useState(true)
  const [napaka, setNapaka] = useState('')

  const [rang, setRang] = useState<CategoryPlayerRank | null>(null)
  const [nalagamRang, setNalagamRang] = useState(true)

  useEffect(() => {
    if (!playerId) return
    let opusceno = false
    setNalagam(true); setNapaka('')

    Promise.all([
      computePlayerSeasonStats(playerId),
      supabase
        .from('league_team_players')
        .select('id, league_team:league_teams(club_name, season:league_seasons(name, year, category))')
        .eq('player_id', playerId),
      supabase
        .from('player_statistics')
        .select('*')
        .eq('player_id', playerId)
        .order('year', { ascending: false }),
    ]).then(([sezoneRes, potRes, turnirjiRes]) => {
      if (opusceno) return
      // Napake ne požiramo: prazna statistika je videti kot "nič ni odigral",
      // kar je najbolj zavajajoč možen izid.
      if (potRes.error) throw potRes.error
      if (turnirjiRes.error) throw turnirjiRes.error

      setSezone(sezoneRes)
      setPot(((potRes.data ?? []) as any[])
        .filter(r => r.league_team?.season)
        .map(r => ({
          id: r.id,
          season: r.league_team.season,
          team: { club_name: r.league_team.club_name },
        }))
        .sort((a, b) => b.season.year - a.season.year))
      setTurnirji((turnirjiRes.data ?? []) as PlayerStatistics[])
    }).catch(e => {
      if (!opusceno) setNapaka(e instanceof Error ? e.message : String(e))
    }).finally(() => {
      if (!opusceno) setNalagam(false)
    })

    return () => { opusceno = true }
  }, [playerId])

  useEffect(() => {
    if (!playerId) return
    let opusceno = false
    setNalagamRang(true)
    computeRangLestvica()
      .then(({ byCategory }) => { if (!opusceno) setRang(findPlayerRankInCategories(byCategory, playerId)) })
      .catch(() => { if (!opusceno) setRang(null) })
      .finally(() => { if (!opusceno) setNalagamRang(false) })
    return () => { opusceno = true }
  }, [playerId])

  const skupaj = turnirji.reduce((acc, s) => ({
    tournaments: acc.tournaments + s.tournaments_played,
    won: acc.won + s.matches_won,
    lost: acc.lost + s.matches_lost,
    points: acc.points + s.points_scored,
    titles: acc.titles + s.titles,
    podiums: acc.podiums + s.podiums,
  }), { tournaments: 0, won: 0, lost: 0, points: 0, titles: 0, podiums: 0 })

  return (
    <>
      {napaka && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-6">
          ⚠ Statistike ni bilo mogoče naložiti: {napaka}
        </div>
      )}

      {/* Sezone + skupni rang */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="text-lg font-semibold text-gray-800">Statistika po sezonah</h2>
          {nalagamRang ? (
            <span className="text-xs text-gray-400">Nalagam rang…</span>
          ) : rang ? (
            <Link to="/rang"
              className="text-sm bg-bocce-green/10 text-bocce-green border border-bocce-green/20 px-3 py-1.5 rounded-full font-medium hover:bg-bocce-green/20 transition-colors">
              Rang {RANG_CATEGORY_LABELS[rang.category as RangCategory]}: <strong>#{rang.mesto}</strong> · {rang.rang.toFixed(2)} t
            </Link>
          ) : (
            <span className="text-xs text-gray-400">Ni uvrščen na rang lestvici</span>
          )}
        </div>

        {sezone.length > 0 ? (
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
                {[...sezone].sort((a, b) => b.year - a.year || a.seasonName.localeCompare(b.seasonName)).map(s => (
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
            {nalagam ? 'Nalagam…' : 'Ni ligaške statistike.'}
          </p>
        )}
      </div>

      {/* Ligaška pot */}
      {pot.length > 0 && (
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
                {pot.map(e => (
                  <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5 pr-6 text-gray-700">{e.season.name}</td>
                    <td className="py-2.5 pr-6 text-gray-800 font-medium">{e.team.club_name}</td>
                    <td className="py-2.5 text-gray-500">{KATEGORIJA_LABELS[e.season.category] ?? e.season.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Turnirji */}
      {turnirji.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
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
                {turnirji.map(s => (
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
                  <td className="py-2.5 pr-4 text-right text-gray-800">{skupaj.tournaments}</td>
                  <td className="py-2.5 pr-4 text-right text-gray-800">{skupaj.won}</td>
                  <td className="py-2.5 pr-4 text-right text-gray-800">{skupaj.lost}</td>
                  <td className="py-2.5 pr-4 text-right text-gray-800">{skupaj.points}</td>
                  <td className="py-2.5 pr-4 text-right text-bocce-gold">{skupaj.titles || '—'}</td>
                  <td className="py-2.5 text-right text-gray-800">{skupaj.podiums || '—'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
