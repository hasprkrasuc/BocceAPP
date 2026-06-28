import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../supabase'
import { loadSeriesStandings, type SeriesStandingRow } from '../../lib/series'
import type { TournamentSeries, Tournament, DisciplineType } from '../../types'

const YOUTH_DISCIPLINES: { value: DisciplineType; label: string }[] = [
  { value: 'posamezno', label: 'Posamezno' },
  { value: 'dvojka', label: 'Dvojka' },
  { value: 'hitrostno', label: 'Hitrostno izbijanje' },
  { value: 'natancno', label: 'Natančno izbijanje' },
  { value: 'blizanje', label: 'Natančno bližanje' },
  { value: 'blizanje_krog', label: 'Bližanje v krog' },
  { value: 'krog', label: 'Krog' },
  { value: 'stafeta', label: 'Štafeta' },
]

export default function SeriesEdit() {
  const { id } = useParams<{ id: string }>()
  const [series, setSeries] = useState<TournamentSeries | null>(null)
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [standings, setStandings] = useState<SeriesStandingRow[]>([])
  const [form, setForm] = useState({ name: '', date: '', location: '', discipline_type: 'posamezno' as DisciplineType })

  const load = useCallback(async () => {
    if (!id) return
    const { data: s } = await supabase.from('tournament_series').select('*').eq('id', id).single()
    setSeries(s as TournamentSeries)
    const { data: ts } = await supabase.from('tournaments').select('*').eq('series_id', id).order('date')
    setTournaments((ts ?? []) as Tournament[])
    if (s) setStandings(await loadSeriesStandings(s as TournamentSeries))
  }, [id])
  useEffect(() => { load() }, [load])

  async function addTournament(e: React.FormEvent) {
    e.preventDefault()
    if (!series) return
    await supabase.from('tournaments').insert({
      name: form.name, date: form.date, location: form.location,
      category: series.category, status: 'draft', group_size: 4,
      series_id: series.id, discipline_type: form.discipline_type,
    })
    setForm({ name: '', date: '', location: '', discipline_type: 'posamezno' })
    load()
  }

  if (!series) return <div className="p-6">Nalagam…</div>

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Link to="/admin/serije" className="text-sm text-gray-500">← Serije</Link>
      <h1 className="text-xl font-bold mb-1">{series.name}</h1>
      <p className="text-xs text-gray-500 mb-6">{series.category.toUpperCase()} · {series.year} · {series.counting_results ? `najboljših ${series.counting_results}` : 'vsi štejejo'}</p>

      <h2 className="font-semibold mb-2">Turnirji v seriji</h2>
      <form onSubmit={addTournament} className="bg-gray-50 border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        <input required placeholder="Ime turnirja" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          className="flex-1 min-w-[160px] border rounded-lg px-3 py-2 text-sm" />
        <input required type="date" value={form.date}
          onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
          className="border rounded-lg px-3 py-2 text-sm" />
        <input placeholder="Kraj" value={form.location}
          onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
          className="w-32 border rounded-lg px-3 py-2 text-sm" />
        <select value={form.discipline_type}
          onChange={e => setForm(f => ({ ...f, discipline_type: e.target.value as DisciplineType }))}
          className="border rounded-lg px-3 py-2 text-sm bg-white">
          {YOUTH_DISCIPLINES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <button className="bg-bocce-green text-white px-4 py-2 rounded-lg text-sm">Dodaj turnir</button>
      </form>

      <div className="space-y-2 mb-8">
        {tournaments.map(t => (
          <Link key={t.id} to={`/admin/turnir/${t.id}`} className="block bg-white border rounded-xl px-4 py-2 hover:bg-gray-50 text-sm">
            <span className="font-medium">{t.name}</span>
            <span className="ml-2 text-xs text-gray-500">{t.date} · {YOUTH_DISCIPLINES.find(d => d.value === t.discipline_type)?.label ?? t.discipline_type} · {t.status}</span>
          </Link>
        ))}
        {tournaments.length === 0 && <p className="text-sm text-gray-400">Ni turnirjev.</p>}
      </div>

      <h2 className="font-semibold mb-2">Lestvica serije</h2>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-gray-500 border-b">
          <th className="py-1 w-10">#</th><th>Igralec</th><th className="text-right">Točke</th><th className="text-right">Turnirjev</th>
        </tr></thead>
        <tbody>
          {standings.map((r, i) => (
            <tr key={r.player_id} className="border-b">
              <td className="py-1">{i + 1}</td>
              <td>{r.full_name ?? r.player_id}</td>
              <td className="text-right font-semibold">{r.total}</td>
              <td className="text-right text-gray-500">{r.tournaments_played}</td>
            </tr>
          ))}
          {standings.length === 0 && <tr><td colSpan={4} className="py-2 text-gray-400">Še ni zaključenih turnirjev.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
