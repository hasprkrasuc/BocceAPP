import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabase'
import type { TournamentSeries } from '../../types'

export default function SeriesAdmin() {
  const [series, setSeries] = useState<TournamentSeries[]>([])
  const [form, setForm] = useState({ name: '', year: new Date().getFullYear(), category: 'u14' as 'u14' | 'u18', counting_results: '' })
  const [loading, setLoading] = useState(false)

  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.from('tournament_series').select('*').order('year', { ascending: false }).order('name')
    setSeries((data ?? []) as TournamentSeries[])
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await supabase.from('tournament_series').insert({
      name: form.name, year: form.year, category: form.category,
      counting_results: form.counting_results === '' ? null : Number(form.counting_results),
      status: 'draft',
    })
    setForm({ name: '', year: new Date().getFullYear(), category: 'u14', counting_results: '' })
    setLoading(false)
    load()
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-xl font-bold mb-4">Mladinske serije</h1>

      <form onSubmit={create} className="bg-gray-50 border rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-end">
        <input required placeholder="Ime serije" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          className="flex-1 min-w-[200px] border rounded-lg px-3 py-2 text-sm" />
        <input type="number" value={form.year}
          onChange={e => setForm(f => ({ ...f, year: Number(e.target.value) }))}
          className="w-24 border rounded-lg px-3 py-2 text-sm" />
        <select value={form.category}
          onChange={e => setForm(f => ({ ...f, category: e.target.value as 'u14' | 'u18' }))}
          className="border rounded-lg px-3 py-2 text-sm bg-white">
          <option value="u14">U14</option>
          <option value="u18">U18</option>
        </select>
        <input type="number" min={1} placeholder="N (najboljših; prazno = vsi)" value={form.counting_results}
          onChange={e => setForm(f => ({ ...f, counting_results: e.target.value }))}
          className="w-44 border rounded-lg px-3 py-2 text-sm" title="Najboljših N rezultatov" />
        <button disabled={loading} className="bg-bocce-green text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          Ustvari serijo
        </button>
      </form>

      <div className="space-y-2">
        {series.map(s => (
          <Link key={s.id} to={`/admin/serija/${s.id}`}
            className="block bg-white border rounded-xl px-4 py-3 hover:bg-gray-50">
            <span className="font-semibold">{s.name}</span>
            <span className="ml-2 text-xs text-gray-500">{s.category.toUpperCase()} · {s.year} · {s.counting_results ? `najboljših ${s.counting_results}` : 'vsi štejejo'} · {s.status}</span>
          </Link>
        ))}
        {series.length === 0 && <p className="text-sm text-gray-400">Ni serij.</p>}
      </div>
    </div>
  )
}
