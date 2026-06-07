import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import ImageUpload from '../../components/ImageUpload'
import type { Club } from '../../types'

type ClubForm = {
  name: string
  short_name: string
  city: string
  founded_year: string
  contact_name: string
  contact_email: string
  contact_phone: string
  website: string
  notes: string
  logo_url: string
  team_photo_url: string
}

const EMPTY: ClubForm = {
  name: '', short_name: '', city: '', founded_year: '',
  contact_name: '', contact_email: '', contact_phone: '',
  website: '', notes: '', logo_url: '', team_photo_url: '',
}

function formFromClub(c: Club): ClubForm {
  return {
    name: c.name,
    short_name: c.short_name ?? '',
    city: c.city ?? '',
    founded_year: c.founded_year?.toString() ?? '',
    contact_name: c.contact_name ?? '',
    contact_email: c.contact_email ?? '',
    contact_phone: c.contact_phone ?? '',
    website: c.website ?? '',
    notes: c.notes ?? '',
    logo_url: c.logo_url ?? '',
    team_photo_url: c.team_photo_url ?? '',
  }
}

export default function ClubAdmin() {
  const [clubs, setClubs] = useState<Club[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Club | null>(null)
  const [form, setForm] = useState<ClubForm>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('clubs').select('*').order('name')
    setClubs((data ?? []) as Club[])
  }

  function openCreate() {
    setEditing(null)
    setForm(EMPTY)
    setShowForm(true)
    setError('')
  }

  function openEdit(c: Club) {
    setEditing(c)
    setForm(formFromClub(c))
    setShowForm(true)
    setError('')
  }

  function set(field: keyof ClubForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = {
      name: form.name,
      short_name: form.short_name || null,
      city: form.city || null,
      founded_year: form.founded_year ? Number(form.founded_year) : null,
      contact_name: form.contact_name || null,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      website: form.website || null,
      notes: form.notes || null,
      logo_url: form.logo_url || null,
      team_photo_url: form.team_photo_url || null,
    }
    try {
      if (editing) {
        const { error } = await supabase.from('clubs').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('clubs').insert(payload)
        if (error) throw error
      }
      setShowForm(false)
      setEditing(null)
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Res izbriši klub?')) return
    await supabase.from('clubs').delete().eq('id', id)
    await load()
  }

  const clubId = editing?.id ?? 'new'

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Upravljanje klubov</h1>
          <p className="text-sm text-gray-500 mt-1">Klubi, kontakti in fotografije</p>
        </div>
        <button onClick={openCreate}
          className="bg-bocce-green text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-bocce-green-light transition-colors">
          + Nov klub
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
          <h2 className="font-semibold text-gray-800 mb-4">{editing ? `Uredi: ${editing.name}` : 'Nov klub'}</h2>
          <form onSubmit={handleSave} className="space-y-6">

            {/* Basic info */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Ime kluba *</label>
                <input required value={form.name} onChange={set('name')} placeholder="BK Postojna"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kratica</label>
                <input value={form.short_name} onChange={set('short_name')} placeholder="BKP"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kraj</label>
                <input value={form.city} onChange={set('city')} placeholder="Postojna"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Leto ustanovitve</label>
                <input type="number" value={form.founded_year} onChange={set('founded_year')} placeholder="1980" min="1900" max="2030"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Spletna stran</label>
                <input type="url" value={form.website} onChange={set('website')} placeholder="https://..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none" />
              </div>
            </div>

            {/* Contacts */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 border-b border-gray-100 pb-2">Kontaktna oseba</h3>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ime in priimek</label>
                  <input value={form.contact_name} onChange={set('contact_name')} placeholder="Janez Novak"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-pošta</label>
                  <input type="email" value={form.contact_email} onChange={set('contact_email')} placeholder="klub@email.si"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
                  <input value={form.contact_phone} onChange={set('contact_phone')} placeholder="+386 ..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none" />
                </div>
              </div>
            </div>

            {/* Images */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 border-b border-gray-100 pb-2">Fotografije</h3>
              <div className="grid sm:grid-cols-2 gap-6">
                <ImageUpload
                  bucket="media"
                  path={`clubs/logos/${clubId}`}
                  currentUrl={form.logo_url || null}
                  onUpload={url => setForm(f => ({ ...f, logo_url: url }))}
                  label="Logotip kluba"
                  shape="square"
                />
                <ImageUpload
                  bucket="media"
                  path={`clubs/photos/${clubId}`}
                  currentUrl={form.team_photo_url || null}
                  onUpload={url => setForm(f => ({ ...f, team_photo_url: url }))}
                  label="Ekipna fotografija"
                  shape="wide"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Opombe</label>
              <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Krajši opis kluba..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none resize-none" />
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <div className="flex gap-3">
              <button type="submit" disabled={saving}
                className="bg-bocce-green text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-bocce-green-light transition-colors disabled:opacity-50">
                {saving ? 'Shranjujem...' : editing ? 'Shrani spremembe' : 'Ustvari klub'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="border border-gray-300 text-gray-600 px-5 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                Prekliči
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Club list */}
      <div className="space-y-3">
        {clubs.length === 0 && (
          <div className="text-center py-12 text-gray-400 italic bg-white border border-gray-200 rounded-xl">
            Ni registriranih klubov
          </div>
        )}
        {clubs.map(c => (
          <div key={c.id} className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                {c.logo_url ? (
                  <img src={c.logo_url} alt={c.name} className="w-14 h-14 rounded-lg object-contain bg-gray-50 border border-gray-100" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-bocce-green/10 flex items-center justify-center text-xl font-bold text-bocce-green">
                    {(c.short_name ?? c.name).charAt(0)}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <h2 className="font-semibold text-gray-800">
                      {c.name}
                      {c.short_name && <span className="text-gray-400 font-normal ml-2 text-sm">({c.short_name})</span>}
                    </h2>
                    <p className="text-sm text-gray-500">
                      {[c.city, c.founded_year ? `Est. ${c.founded_year}` : null].filter(Boolean).join(' · ')}
                    </p>
                    {(c.contact_name || c.contact_email) && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {[c.contact_name, c.contact_email].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={`/klubi/${c.id}`} className="text-xs text-bocce-green hover:underline">Ogled</a>
                    <button onClick={() => openEdit(c)}
                      className="text-xs bg-bocce-green text-white px-2.5 py-1 rounded-lg hover:bg-bocce-green-light transition-colors">
                      Uredi
                    </button>
                    <button onClick={() => handleDelete(c.id)}
                      className="text-xs bg-red-50 text-red-600 border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-100 transition-colors">
                      Izbriši
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
