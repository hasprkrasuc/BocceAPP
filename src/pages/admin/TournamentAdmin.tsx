import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import { format } from 'date-fns'
import type { Tournament, TournamentStatus, TournamentCategory, TournamentKind } from '../../types'

const CATEGORY_LABELS: Record<TournamentCategory, string> = {
  men: 'Moški', women: 'Ženske', u18: 'U18', mixed: 'Mešano',
  u18_women: 'U18 Ženske', u15: 'U15', u12: 'U12',
}
const STATUS_LABELS: Record<TournamentStatus, string> = {
  draft: 'Osnutek', registration_open: 'Prijave odprte', in_progress: 'V teku', completed: 'Zaključen',
}

interface TournamentForm {
  name: string
  kind: TournamentKind
  category: TournamentCategory
  date: string
  location: string
  group_size: string
  max_teams: string
  registration_deadline: string
  notes: string
}

const EMPTY_FORM: TournamentForm = {
  name: '', kind: 'tournament', category: 'men', date: '', location: '',
  group_size: '4', max_teams: '', registration_deadline: '', notes: '',
}

export default function TournamentAdmin() {
  const navigate = useNavigate()
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<TournamentForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<TournamentKind>('tournament')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('tournaments').select('*').order('date', { ascending: false })
    setTournaments((data ?? []) as Tournament[])
  }

  function set(field: keyof TournamentForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const { data, error } = await supabase.from('tournaments').insert({
        name: form.name,
        kind: form.kind,
        category: form.category,
        date: form.date,
        location: form.location,
        group_size: form.group_size,
        max_teams: form.max_teams ? Number(form.max_teams) : null,
        registration_deadline: form.registration_deadline || null,
        notes: form.notes || null,
        status: 'draft',
      }).select().single()
      if (error) throw error
      setShowCreate(false)
      setForm(EMPTY_FORM)
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
    setSaving(false)
  }

  async function updateStatus(id: string, status: TournamentStatus) {
    await supabase.from('tournaments').update({ status }).eq('id', id)
    load()
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Upravljanje tekmovanj</h1>
          <p className="text-sm text-gray-500 mt-1">Turnirji in državna prvenstva</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="bg-bocce-green text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-bocce-green-light transition-colors">
          + Novo tekmovanje
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {([['tournament', 'Turnirji'], ['championship', 'Državna prvenstva']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setActiveTab(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === k ? 'border-bocce-green text-bocce-green' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {showCreate && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
          <h2 className="font-semibold text-gray-800 mb-4">Nov turnir</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vrsta *</label>
                <select value={form.kind} onChange={set('kind')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                  <option value="tournament">Turnir</option>
                  <option value="championship">Državno prvenstvo</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ime *</label>
                <input type="text" required value={form.name} onChange={set('name')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none"
                  placeholder={form.kind === 'championship' ? 'Državno prvenstvo 2025' : 'Postojna Open 2025'} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kategorija *</label>
                <select value={form.category} onChange={set('category')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                  {(Object.entries(CATEGORY_LABELS) as Array<[TournamentCategory, string]>).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Datum *</label>
                <input type="date" required value={form.date} onChange={set('date')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kraj *</label>
                <input type="text" required value={form.location} onChange={set('location')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none"
                  placeholder="Postojna" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ekipe v skupini</label>
                <select value={form.group_size} onChange={set('group_size')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                  <option value="3">3 ekipe (U18 mali)</option>
                  <option value="4">4 ekipe (standardno moški)</option>
                  <option value="5">5 ekip (ženske / U18 veliki)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max ekip</label>
                <input type="number" value={form.max_teams} onChange={set('max_teams')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none"
                  placeholder="32" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rok za prijavo</label>
                <input type="datetime-local" value={form.registration_deadline} onChange={set('registration_deadline')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Opombe</label>
                <input type="text" value={form.notes} onChange={set('notes')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none" />
              </div>
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button type="submit" disabled={saving}
                className="bg-bocce-green text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-bocce-green-light transition-colors disabled:opacity-50">
                {saving ? 'Ustvarjam...' : 'Ustvari turnir'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)}
                className="border border-gray-300 text-gray-600 px-5 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                Prekliči
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {tournaments.filter(t => t.kind === activeTab).map(t => (
          <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h2 className="font-semibold text-gray-800">{t.name}</h2>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{CATEGORY_LABELS[t.category]}</span>
                </div>
                <p className="text-sm text-gray-500">{t.date} · {t.location} · Skupina: {t.group_size} ekip</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                  ${t.status === 'draft' ? 'bg-gray-100 text-gray-600' :
                    t.status === 'registration_open' ? 'bg-green-100 text-green-700' :
                    t.status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                    'bg-blue-100 text-blue-700'}`}>
                  {STATUS_LABELS[t.status]}
                </span>
                <Link to={`${t.kind === 'championship' ? '/prvenstva' : '/turnirji'}/${t.id}`} className="text-xs text-bocce-green hover:underline">Ogled</Link>
                <Link to={`/admin/turnir/${t.id}`}
                  className="text-xs bg-bocce-green text-white px-2.5 py-1 rounded-lg hover:bg-bocce-green-light transition-colors">
                  Uredi
                </Link>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2 flex-wrap">
              {t.status === 'draft' && (
                <button onClick={() => updateStatus(t.id, 'registration_open')}
                  className="text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded-lg hover:bg-green-100 transition-colors">
                  Odpri prijave
                </button>
              )}
              {t.status === 'registration_open' && (
                <button onClick={() => updateStatus(t.id, 'in_progress')}
                  className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 rounded-lg hover:bg-amber-100 transition-colors">
                  Začni turnir
                </button>
              )}
              {t.status === 'in_progress' && (
                <button onClick={() => updateStatus(t.id, 'completed')}
                  className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-lg hover:bg-blue-100 transition-colors">
                  Zaključi
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
