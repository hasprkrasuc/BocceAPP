import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { loadSeriesStandings, type SeriesStandingRow } from '../lib/series'
import type { TournamentSeries } from '../types'

export default function Series() {
  const { id } = useParams<{ id: string }>()
  return id ? <SeriesDetail id={id} /> : <SeriesList />
}

function SeriesList() {
  const [series, setSeries] = useState<TournamentSeries[]>([])
  useEffect(() => {
    supabase.from('tournament_series').select('*').neq('status', 'draft')
      .order('year', { ascending: false }).then(({ data }) => setSeries((data ?? []) as TournamentSeries[]))
  }, [])
  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-bold mb-4">Mladinske serije</h1>
      <div className="space-y-2">
        {series.map(s => (
          <Link key={s.id} to={`/serija/${s.id}`} className="block bg-white border rounded-xl px-4 py-3 hover:bg-gray-50">
            <span className="font-semibold">{s.name}</span>
            <span className="ml-2 text-xs text-gray-500">{s.category.toUpperCase()} · {s.year}</span>
          </Link>
        ))}
        {series.length === 0 && <p className="text-sm text-gray-400">Ni objavljenih serij.</p>}
      </div>
    </div>
  )
}

function SeriesDetail({ id }: { id: string }) {
  const [series, setSeries] = useState<TournamentSeries | null>(null)
  const [standings, setStandings] = useState<SeriesStandingRow[]>([])
  useEffect(() => {
    supabase.from('tournament_series').select('*').eq('id', id).single().then(async ({ data }) => {
      if (!data) return
      setSeries(data as TournamentSeries)
      setStandings(await loadSeriesStandings(data as TournamentSeries))
    })
  }, [id])
  if (!series) return <div className="p-6">Nalagam…</div>
  return (
    <div className="max-w-3xl mx-auto p-6">
      <Link to="/serije" className="text-sm text-gray-500">← Serije</Link>
      <h1 className="text-xl font-bold mb-1">{series.name}</h1>
      <p className="text-xs text-gray-500 mb-6">{series.category.toUpperCase()} · {series.year} · {series.counting_results ? `najboljših ${series.counting_results}` : 'vsi štejejo'}</p>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-gray-500 border-b">
          <th className="py-1 w-10">#</th><th>Igralec</th><th className="text-right">Točke</th><th className="text-right">Turnirjev</th>
        </tr></thead>
        <tbody>
          {standings.map((r, i) => (
            <tr key={r.player_id} className="border-b">
              <td className="py-1">{i + 1}</td><td>{r.full_name ?? '—'}</td>
              <td className="text-right font-semibold">{r.total}</td>
              <td className="text-right text-gray-500">{r.tournaments_played}</td>
            </tr>
          ))}
          {standings.length === 0 && <tr><td colSpan={4} className="py-2 text-gray-400">Še ni rezultatov.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
