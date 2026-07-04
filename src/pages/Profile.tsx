import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../supabase'
import type { UserProfile, LeagueFixture, DoubleRegistration, LeagueTeam, LeagueSeason } from '../types'
import {
  isAgeEligible, calcAge, isFemale, eligibleSecondaryTeams, latestSeasonsOnly, primaryTeams,
  DOUBLE_REG_MAX_AGE,
  DR_TIER_LABELS, DR_STATUS_COLORS, DR_STATUS_LABELS,
} from '../engines/doubleRegistration'

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

  // ── Dvojna registracija ─────────────────────────────────────
  type TeamWithSeason = LeagueTeam & { season: Pick<LeagueSeason, 'id' | 'name' | 'tier' | 'category' | 'year'> }
  const [myTeams, setMyTeams] = useState<TeamWithSeason[]>([])
  const [eligibleTeams, setEligibleTeams] = useState<TeamWithSeason[]>([])
  const [doubleRegs, setDoubleRegs] = useState<DoubleRegistration[]>([])
  const [drLoading, setDrLoading] = useState(false)
  const [drSubmitting, setDrSubmitting] = useState(false)
  const [selectedSecondary, setSelectedSecondary] = useState('')
  const [drMsg, setDrMsg] = useState('')

  const ageEligible = isAgeEligible(profile?.date_of_birth)

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

    // Naloži podatke za dvojno registracijo
    loadDoubleRegData()
  }, [user?.id])

  async function loadDoubleRegData() {
    if (!user) return
    setDrLoading(true)
    try {
      // 1. Moje ekipe v tekoči sezoni
      const { data: tpData } = await supabase
        .from('league_team_players')
        .select('league_team_id, league_teams(id, club_name, season_id, season:league_seasons(id, name, tier, category, year))')
        .eq('player_id', user.id)

      // Vedno najnovejša sezona — tudi zaključena. Pri ženskah je primarna
      // lahko katerakoli njena ekipa (tudi U18 — klub pogosto nima ženske ekipe).
      const teams: TeamWithSeason[] = latestSeasonsOnly(primaryTeams(profile?.gender,
        (tpData ?? [])
          .map((tp: { league_teams: TeamWithSeason }) => tp.league_teams)
          .filter(Boolean)))

      setMyTeams(teams)

      // 2. Ekipe za katere BI lahko dvojno registriral (spolno-zavedno pravilo)
      const { data: allTeams } = await supabase
        .from('league_teams')
        .select('id, club_name, season_id, season:league_seasons(id, name, tier, category, year)')

      const candidates = latestSeasonsOnly(((allTeams ?? []) as any[])
        .filter(t => t?.season))
      const eligibleRefs = eligibleSecondaryTeams(
        profile?.gender,
        teams.map(t => ({ id: t.id, tier: t.season.tier })),
        candidates.map((t: any) => ({ id: t.id, tier: t.season?.tier, category: t.season?.category })),
      )
      const eligibleIds = new Set(eligibleRefs.map(r => r.id))
      setEligibleTeams(candidates.filter((t: any) => eligibleIds.has(t.id)) as TeamWithSeason[])

      // 4. Obstoječe dvojne registracije
      const { data: drData } = await supabase
        .from('double_registrations')
        .select('*, primary_team:league_teams!primary_team_id(id, club_name, season:league_seasons(name, tier)), secondary_team:league_teams!secondary_team_id(id, club_name, season:league_seasons(name, tier))')
        .eq('player_id', user.id)
        .order('requested_at', { ascending: false })
      setDoubleRegs((drData ?? []) as DoubleRegistration[])
    } finally {
      setDrLoading(false)
    }
  }

  async function submitDoubleReg() {
    if (!user || !selectedSecondary || myTeams.length === 0) return
    setDrSubmitting(true); setDrMsg('')
    const primaryTeam = myTeams[0]
    const { error } = await supabase.from('double_registrations').insert({
      player_id:          user.id,
      primary_team_id:    primaryTeam.id,
      secondary_team_id:  selectedSecondary,
      season_id:          primaryTeam.season.id,
    })
    if (error) {
      setDrMsg(`❌ ${error.message}`)
    } else {
      setDrMsg('✓ Vloga za dvojno registracijo je bila oddana. Čaka na odobritev.')
      setSelectedSecondary('')
      loadDoubleRegData()
    }
    setDrSubmitting(false)
  }

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
      {/* ── Dvojna registracija — samo prikaz statusa ──────── */}
      {doubleRegs.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-bold text-gray-800 mb-3">Dvojna registracija</h2>
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-2">
            {doubleRegs.map(dr => (
              <div key={dr.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
                <div className="flex-1 text-sm text-gray-700">
                  <span className="font-medium">{dr.primary_team?.club_name}</span>
                  <span className="mx-2 text-gray-400">→</span>
                  <span className="font-medium">{dr.secondary_team?.club_name}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${DR_STATUS_COLORS[dr.status]}`}>
                  {DR_STATUS_LABELS[dr.status]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
