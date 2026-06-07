import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import type { Club, UserProfile } from '../types'

// ──────────────────────────────────────────────────────────────
// CLUB LIST
// ──────────────────────────────────────────────────────────────

const TIER_CONFIG: { key: string; label: string }[] = [
  { key: 'super_liga',     label: 'Super liga' },
  { key: '1_liga',         label: '1. liga' },
  { key: '1_liga_clanice', label: '1. liga — članice' },
  { key: '2_liga_vzhod',   label: '2. liga — vzhod' },
  { key: '2_liga_zahod',   label: '2. liga — zahod' },
  { key: 'obz',            label: 'OBZ in ostalo' },
]

function ClubCard({ c }: { c: Club }) {
  return (
    <Link to={`/klubi/${c.id}`}
      className="bg-white border border-gray-200 rounded-xl p-5 hover:border-bocce-green hover:shadow-sm transition-all flex items-center gap-4">
      <div className="flex-shrink-0">
        {c.logo_url ? (
          <img src={c.logo_url} alt={c.name} className="w-14 h-14 rounded-lg object-contain bg-gray-50 border border-gray-100" />
        ) : (
          <div className="w-14 h-14 rounded-lg bg-bocce-green/10 flex items-center justify-center text-2xl font-bold text-bocce-green">
            {(c.short_name ?? c.name).charAt(0)}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <h2 className="font-semibold text-gray-800 truncate">{c.name}</h2>
        {c.city && <p className="text-sm text-gray-500">{c.city}</p>}
        {c.founded_year && <p className="text-xs text-gray-400">Est. {c.founded_year}</p>}
      </div>
    </Link>
  )
}

export function ClubList() {
  const [clubs, setClubs] = useState<Club[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('clubs').select('*').order('name')
      .then(({ data }) => { setClubs((data ?? []) as Club[]); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Klubi</h1>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      </div>
    )
  }

  const byTier: Record<string, Club[]> = {}
  for (const c of clubs) {
    const tier = (c as Club & { tier?: string }).tier ?? 'obz'
    if (!byTier[tier]) byTier[tier] = []
    byTier[tier].push(c)
  }

  const sections = TIER_CONFIG.filter(t => byTier[t.key]?.length)

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-8">Klubi</h1>

      {sections.length === 0 ? (
        <div className="text-center py-16 text-gray-400 italic">Ni registriranih klubov</div>
      ) : (
        <div className="space-y-10">
          {sections.map(({ key, label }) => (
            <section key={key}>
              <h2 className="text-lg font-semibold text-gray-700 mb-3 pb-1 border-b border-gray-200">
                {label}
                <span className="ml-2 text-sm font-normal text-gray-400">({byTier[key].length})</span>
              </h2>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                {byTier[key].map(c => <ClubCard key={c.id} c={c} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// CLUB DETAIL
// ──────────────────────────────────────────────────────────────
export function ClubDetail() {
  const { id } = useParams<{ id: string }>()
  const [club, setClub] = useState<Club | null>(null)
  const [members, setMembers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('clubs').select('*').eq('id', id).single(),
      supabase.from('users').select('*').eq('club_id', id).order('full_name'),
    ]).then(([{ data: c }, { data: m }]) => {
      setClub(c as Club)
      setMembers((m ?? []) as UserProfile[])
      setLoading(false)
    })
  }, [id])

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-bocce-green" /></div>
  if (!club) return <div className="text-center py-12 text-gray-400">Klub ni najden</div>

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link to="/klubi" className="inline-block text-sm text-bocce-green hover:underline mb-4">← Klubi</Link>

      {/* Header card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
        <div className="flex items-start gap-6 flex-wrap">
          <div className="flex-shrink-0">
            {club.logo_url ? (
              <img src={club.logo_url} alt={club.name}
                className="w-24 h-24 rounded-xl object-contain bg-gray-50 border border-gray-200" />
            ) : (
              <div className="w-24 h-24 rounded-xl bg-bocce-green/10 flex items-center justify-center text-4xl font-bold text-bocce-green">
                {(club.short_name ?? club.name).charAt(0)}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-800">{club.name}</h1>
            {club.short_name && <p className="text-gray-500 text-sm">{club.short_name}</p>}
            <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-sm text-gray-600">
              {club.city && <span>📍 {club.city}</span>}
              {club.founded_year && <span>📅 Ustanovljen {club.founded_year}</span>}
              {club.website && (
                <a href={club.website} target="_blank" rel="noopener noreferrer"
                  className="text-bocce-green hover:underline">🌐 Spletna stran</a>
              )}
            </div>
          </div>
        </div>

        {/* Contacts */}
        {(club.contact_name || club.contact_email || club.contact_phone) && (
          <div className="mt-5 pt-5 border-t border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Kontakt</h2>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
              {club.contact_name && <span>👤 {club.contact_name}</span>}
              {club.contact_email && (
                <a href={`mailto:${club.contact_email}`} className="text-bocce-green hover:underline">
                  ✉️ {club.contact_email}
                </a>
              )}
              {club.contact_phone && <span>📞 {club.contact_phone}</span>}
            </div>
          </div>
        )}

        {club.notes && (
          <p className="mt-4 text-sm text-gray-500 italic">{club.notes}</p>
        )}
      </div>

      {/* Team photo */}
      {club.team_photo_url && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Ekipna fotografija</h2>
          <img src={club.team_photo_url} alt={`${club.name} - ekipa`}
            className="w-full rounded-2xl object-cover max-h-72 border border-gray-200" />
        </div>
      )}

      {/* Members */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">
          Člani <span className="text-sm font-normal text-gray-400">({members.length})</span>
        </h2>
        {members.length === 0 ? (
          <div className="text-center py-8 text-gray-400 italic bg-gray-50 rounded-xl">Ni registriranih članov</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {members.map(m => (
              <Link key={m.id} to={`/igraci/${m.id}`}
                className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3 hover:border-bocce-green hover:shadow-sm transition-all">
                {m.photo_url ? (
                  <img src={m.photo_url} alt={m.full_name ?? ''}
                    className="w-12 h-12 rounded-full object-cover flex-shrink-0 border border-gray-200" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-bocce-green/10 flex items-center justify-center text-lg font-bold text-bocce-green flex-shrink-0">
                    {(m.full_name ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">{m.full_name}</p>
                  <div className="flex gap-2 flex-wrap">
                    {m.license_number && (
                      <span className="text-xs text-gray-400">Licenca: {m.license_number}</span>
                    )}
                    {m.date_of_birth && (
                      <span className="text-xs text-gray-400">r. {m.date_of_birth.slice(0, 4)}</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
