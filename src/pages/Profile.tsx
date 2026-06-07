import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../supabase'
import type { UserProfile, LeagueFixture } from '../types'

interface JudgeFixture extends LeagueFixture {
  home_team?: { club_name: string }
  away_team?: { club_name: string }
  season?: { name: string }
}

type ProfileForm = Pick<UserProfile, 'full_name' | 'phone' | 'club' | 'license_number' | 'date_of_birth'>

export default function Profile() {
  const { user, profile, updateProfile } = useAuth()
  const [form, setForm] = useState<ProfileForm>({
    full_name: profile?.full_name ?? '',
    phone: profile?.phone ?? '',
    club: profile?.club ?? '',
    license_number: profile?.license_number ?? '',
    date_of_birth: profile?.date_of_birth ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [chiefFixtures, setChiefFixtures] = useState<JudgeFixture[]>([])
  const [judgeFixtures, setJudgeFixtures] = useState<JudgeFixture[]>([])

  useEffect(() => {
    if (!user) return
    const select = '*, home_team:league_teams!league_fixtures_home_team_id_fkey(club_name), away_team:league_teams!league_fixtures_away_team_id_fkey(club_name), season:league_seasons(name)'
    Promise.all([
      supabase.from('league_fixtures').select(select).eq('chief_judge_id', user.id).order('scheduled_date'),
      supabase.from('league_fixtures').select(select).contains('judge_ids', [user.id]).order('scheduled_date'),
    ]).then(([{ data: chief }, { data: judgeOf }]) => {
      setChiefFixtures((chief ?? []) as JudgeFixture[])
      setJudgeFixtures((judgeOf ?? []) as JudgeFixture[])
    })
  }, [user?.id])

  function set(field: keyof ProfileForm) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true); setError(''); setSaved(false)
    try {
      await updateProfile(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError((err as Error).message)
    }
    setSaving(false)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Moj profil</h1>
      <p className="text-sm text-gray-500 mb-6">{user?.email}</p>

      <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ime in priimek *</label>
            <input type="text" required value={form.full_name ?? ''} onChange={set('full_name')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-bocce-green outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
            <input type="tel" value={form.phone ?? ''} onChange={set('phone')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-bocce-green outline-none"
              placeholder="+386 ..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Klub</label>
            <input type="text" value={form.club ?? ''} onChange={set('club')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-bocce-green outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Številka licence</label>
            <input type="text" value={form.license_number ?? ''} onChange={set('license_number')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-bocce-green outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Datum rojstva</label>
            <input type="date" value={form.date_of_birth ?? ''} onChange={set('date_of_birth')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-bocce-green outline-none" />
          </div>
        </div>

        <div className="pt-2 flex items-center gap-3">
          <button type="submit" disabled={saving}
            className="bg-bocce-green text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-bocce-green-light transition-colors disabled:opacity-50">
            {saving ? 'Shranjujem...' : 'Shrani spremembe'}
          </button>
          {saved && <span className="text-green-600 text-sm font-medium">✓ Shranjeno</span>}
          {error && <span className="text-red-600 text-sm">{error}</span>}
        </div>
      </form>

      {profile?.role && profile.role !== 'player' && (
        <div className="mt-4 bg-bocce-gold/10 border border-bocce-gold/30 rounded-xl p-4">
          <p className="text-sm font-medium text-bocce-gold">
            Tvoja vloga: {profile.role === 'admin' ? 'Administrator' : profile.role === 'super_admin' ? 'Super administrator' : 'Igralec'}
          </p>
        </div>
      )}

      {(chiefFixtures.length > 0 || judgeFixtures.length > 0) && (
        <div className="mt-6">
          <h2 className="text-lg font-bold text-gray-800 mb-3">Moje sodniške tekme</h2>

          {chiefFixtures.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Kot glavni sodnik</p>
              <div className="space-y-2">
                {chiefFixtures.map(f => (
                  <div key={f.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {f.home_team?.club_name} – {f.away_team?.club_name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {f.season?.name}{f.scheduled_date ? ` · ${new Date(f.scheduled_date).toLocaleDateString('sl-SI')}` : ''} · {f.round_number}. kolo
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {f.status === 'completed' && (
                        <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          {f.home_score} : {f.away_score}
                        </span>
                      )}
                      <Link to={`/admin/liga/tekma/${f.id}`}
                        className="flex items-center gap-1 bg-bocce-green text-white text-xs px-3 py-1.5 rounded-lg hover:bg-bocce-green-light transition-colors">
                        ✏ Uredi zapisnik
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {judgeFixtures.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Kot sodnik</p>
              <div className="space-y-2">
                {judgeFixtures.map(f => (
                  <div key={f.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {f.home_team?.club_name} – {f.away_team?.club_name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {f.season?.name}{f.scheduled_date ? ` · ${new Date(f.scheduled_date).toLocaleDateString('sl-SI')}` : ''} · {f.round_number}. kolo
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {f.status === 'completed' && (
                        <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          {f.home_score} : {f.away_score}
                        </span>
                      )}
                      <Link to={`/admin/liga/tekma/${f.id}`}
                        className="text-xs border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                        Oglej zapisnik
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
