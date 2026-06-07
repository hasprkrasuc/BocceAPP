import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { format } from 'date-fns'
import { sl as dateSl } from 'date-fns/locale'
import type { Tournament, TournamentCategory, PlayerStatistics } from '../types'

// ──────────────────────────────────────────────────────────────
// STATISTICS PAGE
// ──────────────────────────────────────────────────────────────
type SortKey = 'titles' | 'matches_won' | 'podiums' | 'tournaments_played' | 'points_scored'

export function Statistics() {
  const [stats, setStats] = useState<PlayerStatistics[]>([])
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [sort, setSort] = useState<SortKey>('titles')
  const [loading, setLoading] = useState(true)

  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i)

  useEffect(() => {
    setLoading(true)
    supabase.from('player_statistics')
      .select(`*, player:users(full_name, club)`)
      .eq('year', year)
      .order(sort, { ascending: false })
      .limit(50)
      .then(({ data }) => { setStats((data ?? []) as PlayerStatistics[]); setLoading(false) })
  }, [year, sort])

  const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
    { key: 'titles', label: 'Naslovi' },
    { key: 'matches_won', label: 'Zmage' },
    { key: 'podiums', label: 'Oder' },
    { key: 'tournaments_played', label: 'Turnirji' },
    { key: 'points_scored', label: 'Točke' },
  ]

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Statistika igralcev</h1>

      <div className="flex flex-wrap gap-3 mb-6">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Leto</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Razvrsti po</label>
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
            {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : stats.length === 0 ? (
        <div className="text-center py-12 text-gray-400 italic">Ni statistike za leto {year}</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-bocce-green text-white text-xs uppercase tracking-wide">
                <th className="px-3 py-3 text-left w-8">#</th>
                <th className="px-3 py-3 text-left">Igralec</th>
                <th className="px-3 py-3 text-left">Klub</th>
                <th className="px-3 py-3 text-center" title="Turnirji">T</th>
                <th className="px-3 py-3 text-center" title="Zmage tekem">Z</th>
                <th className="px-3 py-3 text-center" title="Porazi tekem">P</th>
                <th className="px-3 py-3 text-center" title="Točke za">Pkt</th>
                <th className="px-3 py-3 text-center" title="Naslovi">🏆</th>
                <th className="px-3 py-3 text-center" title="Oder za zmago">🥇🥈🥉</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s, i) => (
                <tr key={s.id} className={`border-b border-gray-100 hover:bg-bocce-green/5 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                  <td className="px-3 py-2.5 text-center text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2.5 font-medium text-gray-800">{s.player?.full_name ?? '—'}</td>
                  <td className="px-3 py-2.5 text-gray-500">{s.player?.club ?? '—'}</td>
                  <td className="px-3 py-2.5 text-center text-gray-600">{s.tournaments_played}</td>
                  <td className="px-3 py-2.5 text-center text-green-700 font-medium">{s.matches_won}</td>
                  <td className="px-3 py-2.5 text-center text-red-500">{s.matches_lost}</td>
                  <td className="px-3 py-2.5 text-center text-gray-600">{s.points_scored}</td>
                  <td className="px-3 py-2.5 text-center font-bold text-bocce-gold">{s.titles || '—'}</td>
                  <td className="px-3 py-2.5 text-center text-gray-600">{s.podiums || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// ARCHIVE PAGE
// ──────────────────────────────────────────────────────────────
const CATEGORY_LABELS: Record<TournamentCategory, string> = {
  men: 'Moški', women: 'Ženske', u18: 'U18', mixed: 'Mešano',
  u18_women: 'U18 Ženske', u15: 'U15', u12: 'U12',
}

export function Archive() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [categoryFilter, setCategoryFilter] = useState<TournamentCategory | 'all'>('all')
  const [yearFilter, setYearFilter] = useState<number | 'all'>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('tournaments').select('*').eq('status', 'completed')
      .order('date', { ascending: false })
      .then(({ data }) => { setTournaments((data ?? []) as Tournament[]); setLoading(false) })
  }, [])

  const years = [...new Set(tournaments.map(t => new Date(t.date).getFullYear()))].sort((a, b) => b - a)
  const filtered = tournaments.filter(t => {
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false
    if (yearFilter !== 'all' && new Date(t.date).getFullYear() !== yearFilter) return false
    return true
  })

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Arhiv rezultatov</h1>

      <div className="flex flex-wrap gap-3 mb-6">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Kategorija</label>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as TournamentCategory | 'all')}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
            <option value="all">Vse</option>
            {(Object.entries(CATEGORY_LABELS) as Array<[TournamentCategory, string]>).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        {years.length > 0 && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Leto</label>
            <select value={yearFilter} onChange={e => setYearFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
              <option value="all">Vsa leta</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 italic">Ni zaključenih turnirjev</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(t => (
            <Link key={t.id} to={`/turnirji/${t.id}`}
              className="block bg-white border border-gray-200 rounded-xl p-5 hover:border-bocce-green hover:shadow-sm transition-all">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="font-semibold text-gray-800">{t.name}</h2>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                      {CATEGORY_LABELS[t.category]}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">
                    {format(new Date(t.date), 'd. MMMM yyyy', { locale: dateSl })} · {t.location}
                  </p>
                </div>
                <span className="text-bocce-green text-sm font-medium whitespace-nowrap">
                  Ogled →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
