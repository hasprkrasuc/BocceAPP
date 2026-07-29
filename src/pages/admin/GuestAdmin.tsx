import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import type { GuestPlayer } from '../../types'

/**
 * Urejanje gostujočih (tujih/neregistriranih) igralcev — preimenovanje in klub.
 * Ker gost ohrani isti ID, se popravek pozna povsod (prijave, lestvice serij).
 */
export default function GuestAdmin() {
  const [guests, setGuests] = useState<GuestPlayer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [savedId, setSavedId] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('guest_players').select('*').order('full_name')
    setGuests((data ?? []) as GuestPlayer[])
    setLoading(false)
  }

  async function save(id: string, patch: Partial<GuestPlayer>) {
    const { error } = await supabase.from('guest_players').update(patch).eq('id', id)
    if (!error) {
      setGuests(gs => gs.map(g => g.id === id ? { ...g, ...patch } : g))
      setSavedId(id); setTimeout(() => setSavedId(s => s === id ? null : s), 1500)
    }
  }

  const filtered = guests.filter(g =>
    (g.full_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (g.club ?? '').toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Gostujoči igralci</h1>
      <p className="text-sm text-gray-500 mb-6">
        Tuji / neregistrirani igralci ({guests.length}). Preimenovanje se pozna povsod (prijave, lestvice).
      </p>

      <input type="search" value={search} onChange={e => setSearch(e.target.value)}
        className="w-full max-w-md border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none mb-4"
        placeholder="Išči po imenu ali klubu..." />

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(g => (
            <div key={g.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2">
              <label className="flex-1 min-w-[160px]">
                <span className="block text-[11px] text-gray-400 mb-0.5">Ime in priimek</span>
                <input defaultValue={g.full_name ?? ''}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== g.full_name) save(g.id, { full_name: v }) }}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-bocce-green outline-none" />
              </label>
              <label className="w-40">
                <span className="block text-[11px] text-gray-400 mb-0.5">Klub (neobvezno)</span>
                <input defaultValue={g.club ?? ''}
                  onBlur={e => { const v = e.target.value.trim(); if (v !== (g.club ?? '')) save(g.id, { club: v || null }) }}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-bocce-green outline-none" />
              </label>
              <span className="w-16 text-right">
                {savedId === g.id && <span className="text-green-600 text-xs font-medium">✓ shranjeno</span>}
              </span>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-sm text-gray-400 py-4">Ni gostov.</p>}
        </div>
      )}
    </div>
  )
}
