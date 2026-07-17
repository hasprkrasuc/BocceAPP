import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabase'
import { bergerFixtures, MAX_BERGER_TEAMS } from '../../engines/berger'
import { DEFAULT_DISCIPLINES, BLOCK_LABELS } from '../../engines/leagueDisciplines'
import type { LeagueSeason, LeagueTeam, LeagueFixture, LeagueSeasonStatus, LeagueCategory, LeagueTier, LeagueSeasonDiscipline, UserProfile, DisciplineType } from '../../types'

const TIER_LABELS: Record<LeagueTier, string> = {
  super_liga: 'Super Liga',
  '1_liga': '1. Liga',
  '2_liga_zahod': '2. Liga Zahod',
  '2_liga_vzhod': '2. Liga Vzhod',
  obz: 'Območna liga',
}

const OBZ_OPTIONS = [
  'OBZ Nova Gorica', 'OBZ Postojna', 'OBZ Notranjska', 'OBZ Sežana', 'OBZ Slovenska Istra',
  'Šaleška BZ', 'OBZ Ljubljana', 'OBZ Gorenjska', 'OBZ Maribor', 'OBZ Dolenjska',
]

// Stolpci po ligah (vrstni red od leve proti desni). Znotraj stolpca: najsvežejša sezona zgoraj.
const LEAGUE_COLUMNS: Array<{ label: string; match: (s: LeagueSeason) => boolean }> = [
  { label: 'Super Liga', match: s => s.tier === 'super_liga' },
  { label: '1. liga članice', match: s => s.tier === '1_liga' && s.category === 'women' },
  { label: '1. liga člani', match: s => s.tier === '1_liga' && s.category === 'men' },
  { label: '2. liga zahod', match: s => s.tier === '2_liga_zahod' },
  { label: '2. liga vzhod', match: s => s.tier === '2_liga_vzhod' },
  { label: 'U18', match: s => s.category === 'u18' },
  { label: 'U14', match: s => s.category === 'u14' },
]
const seasonShort = (name: string) => name.match(/\d{4}\/\d{2}|\d{4}/)?.[0] ?? name

interface SeasonForm {
  name: string
  year: number
  tier: LeagueTier
  obz_name: string
  category: LeagueCategory
  rounds_count: number
  win_points: number
  draw_points: number
  loss_points: number
}

interface TeamForm {
  club_name: string
  short_name: string
  captain_id: string
}

type ScoreEditing = Record<string, { home: string; away: string }>

export default function LeagueAdmin() {
  const [seasons, setSeasons] = useState<LeagueSeason[]>([])
  const [selectedSeason, setSelectedSeason] = useState<LeagueSeason | null>(null)
  const [teams, setTeams] = useState<LeagueTeam[]>([])
  const [fixtures, setFixtures] = useState<LeagueFixture[]>([])
  const [players, setPlayers] = useState<Pick<UserProfile, 'id' | 'full_name' | 'club'>[]>([])
  const [disciplines, setDisciplines] = useState<LeagueSeasonDiscipline[]>([])
  const [tab, setTab] = useState<'teams' | 'fixtures' | 'discipline'>('teams')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<SeasonForm>({
    name: '', year: new Date().getFullYear(), tier: 'super_liga', obz_name: '',
    category: 'men', rounds_count: 1, win_points: 2, draw_points: 1, loss_points: 0,
  })
  const [teamForm, setTeamForm] = useState<TeamForm>({ club_name: '', short_name: '', captain_id: '' })
  const [scoreEditing, setScoreEditing] = useState<ScoreEditing>({})
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [copyFromSeasonId, setCopyFromSeasonId] = useState('')
  const [showAddDisc, setShowAddDisc] = useState(false)
  const [discForm, setDiscForm] = useState<{
    name: string; discipline_type: DisciplineType
    players_per_side: number; has_reserve: boolean
    block_number: number; order_num: number
  }>({ name: '', discipline_type: 'posamezno', players_per_side: 1, has_reserve: false, block_number: 1, order_num: 1 })

  useEffect(() => { loadSeasons() }, [])
  useEffect(() => { if (selectedSeason) { loadTeams(); loadFixtures(); loadDisciplines() } }, [selectedSeason])
  useEffect(() => {
    supabase.from('users').select('id, full_name, club').order('full_name')
      .then(({ data }) => setPlayers((data ?? []) as Pick<UserProfile, 'id' | 'full_name' | 'club'>[]))
  }, [])

  async function loadDisciplines() {
    if (!selectedSeason) return
    const { data } = await supabase
      .from('league_season_disciplines')
      .select('*')
      .eq('season_id', selectedSeason.id)
      .order('order_num')
    setDisciplines((data ?? []) as LeagueSeasonDiscipline[])
  }

  async function seedDisciplines(seasonId: string, tier: LeagueTier) {
    const templates = DEFAULT_DISCIPLINES[tier]
    await supabase.from('league_season_disciplines').insert(
      templates.map(t => ({ season_id: seasonId, ...t }))
    )
  }

  async function toggleDiscipline(disc: LeagueSeasonDiscipline) {
    if (window.confirm(`Izbriši disciplino "${disc.name}"?`)) {
      await supabase.from('league_season_disciplines').delete().eq('id', disc.id)
      loadDisciplines()
    }
  }

  async function addDiscipline(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedSeason) return
    setLoading(true)
    await supabase.from('league_season_disciplines').insert({
      season_id: selectedSeason.id,
      ...discForm,
    })
    setShowAddDisc(false)
    setDiscForm({ name: '', discipline_type: 'posamezno', players_per_side: 1, has_reserve: false, block_number: 1, order_num: disciplines.length + 2 })
    await loadDisciplines()
    setLoading(false)
  }

  async function copyDisciplinesFromSeason(sourceSeasonId: string) {
    if (!selectedSeason || !sourceSeasonId) return
    const sourceName = seasons.find(s => s.id === sourceSeasonId)?.name ?? 'izbrano sezono'
    if (!window.confirm(`Kopiraj discipline iz "${sourceName}"?\nTo bo IZBRISALO vse obstoječe discipline te sezone.`)) return
    setLoading(true)
    const { data: src } = await supabase
      .from('league_season_disciplines')
      .select('name, discipline_type, players_per_side, has_reserve, block_number, order_num')
      .eq('season_id', sourceSeasonId)
      .order('order_num')
    if (!src || src.length === 0) {
      setMessage('Izbrana sezona nima disciplin')
      setLoading(false)
      return
    }
    await supabase.from('league_season_disciplines').delete().eq('season_id', selectedSeason.id)
    await supabase.from('league_season_disciplines').insert(
      src.map(d => ({ ...d, season_id: selectedSeason.id }))
    )
    setMessage(`✓ Kopirano ${src.length} disciplin iz "${sourceName}"`)
    setCopyFromSeasonId('')
    await loadDisciplines()
    setLoading(false)
  }

  async function loadSeasons() {
    const { data } = await supabase.from('league_seasons').select('*').order('year', { ascending: false })
    const s = (data ?? []) as LeagueSeason[]
    setSeasons(s)
    if (s.length > 0 && !selectedSeason) setSelectedSeason(s[0])
  }

  async function loadTeams() {
    if (!selectedSeason) return
    const { data } = await supabase.from('league_teams')
      .select('*, captain:users(*), league_team_players(*, player:users(*))')
      .eq('season_id', selectedSeason.id)
      .order('draw_number', { ascending: true, nullsFirst: false })
      .order('club_name')
    setTeams((data ?? []) as LeagueTeam[])
  }

  async function loadFixtures() {
    if (!selectedSeason) return
    const { data } = await supabase.from('league_fixtures')
      .select('*, home_team:league_teams!league_fixtures_home_team_id_fkey(*), away_team:league_teams!league_fixtures_away_team_id_fkey(*)')
      .eq('season_id', selectedSeason.id).order('round_number').order('scheduled_date')
    setFixtures((data ?? []) as LeagueFixture[])
  }

  function set(field: keyof SeasonForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [field]: e.target.type === 'number' ? Number(e.target.value) : e.target.value }))
  }

  function setTeamField(field: keyof TeamForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setTeamForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function createSeason(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const { data, error } = await supabase.from('league_seasons').insert({
      name: form.name, year: form.year, category: form.category,
      tier: form.tier, obz_name: form.tier === 'obz' ? form.obz_name || null : null,
      rounds_count: form.rounds_count, win_points: form.win_points,
      draw_points: form.draw_points, loss_points: form.loss_points,
      status: 'draft',
    }).select().single()
    if (!error && data) {
      await seedDisciplines(data.id, form.tier)
      setShowCreate(false)
      await loadSeasons()
      setSelectedSeason(data as LeagueSeason)
    }
    setLoading(false)
  }

  async function addTeam(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedSeason) return
    setLoading(true)
    await supabase.from('league_teams').insert({
      season_id: selectedSeason.id,
      club_name: teamForm.club_name,
      short_name: teamForm.short_name || null,
      captain_id: teamForm.captain_id || null,
    })
    setTeamForm({ club_name: '', short_name: '', captain_id: '' })
    await loadTeams()
    setLoading(false)
  }

  async function removeTeam(teamId: string) {
    if (!window.confirm('Izbriši ekipo?')) return
    await supabase.from('league_teams').delete().eq('id', teamId)
    loadTeams()
  }

  async function addPlayerToTeam(teamId: string, playerId: string) {
    if (!playerId) return
    await supabase.from('league_team_players').insert({ league_team_id: teamId, player_id: playerId })
    loadTeams()
  }

  async function removePlayerFromTeam(memberId: string) {
    await supabase.from('league_team_players').delete().eq('id', memberId)
    loadTeams()
  }

  /** Vnos žrebane številke ekipe (optimistično v UI + shrani v bazo). */
  function changeDrawNumber(teamId: string, value: string) {
    const n = value === '' ? null : Number(value)
    setTeams(ts => ts.map(t => (t.id === teamId ? { ...t, draw_number: n } : t)))
    supabase.from('league_teams').update({ draw_number: n }).eq('id', teamId)
  }

  async function handleGenerateFixtures() {
    if (!selectedSeason || teams.length < 2) { setMessage('Premalo ekip za razpored'); return }
    if (teams.length > MAX_BERGER_TEAMS) {
      setMessage(`Bergerjeva tabela je na voljo do ${MAX_BERGER_TEAMS} ekip (trenutno ${teams.length}).`)
      return
    }
    // Razpored se sestavi po Bergerju iz žrebanih številk — preveri veljavnost žreba.
    let fixtureList
    try {
      fixtureList = bergerFixtures(teams, selectedSeason.rounds_count > 1)
    } catch (err) {
      setMessage(`⚠ ${err instanceof Error ? err.message : 'Napaka pri žrebu'}`)
      return
    }
    if (!window.confirm(`Ustvari Bergerjev razpored za ${teams.length} ekip? To bo izbrisalo obstoječe tekme!`)) return
    setLoading(true)
    await supabase.from('league_fixtures').delete().eq('season_id', selectedSeason.id)
    for (const f of fixtureList) {
      await supabase.from('league_fixtures').insert({
        season_id: selectedSeason.id,
        round_number: f.round_number,
        home_team_id: f.home_team_id,
        away_team_id: f.away_team_id,
        status: 'scheduled',
      })
    }
    setMessage(`✓ Ustvarjenih ${fixtureList.length} tekem`)
    await loadFixtures()
    setLoading(false)
  }

  async function updateSeasonStatus(status: LeagueSeasonStatus) {
    if (!selectedSeason) return
    await supabase.from('league_seasons').update({ status }).eq('id', selectedSeason.id)
    loadSeasons()
  }

  async function saveScore(fixtureId: string, homeScore: string, awayScore: string) {
    await supabase.from('league_fixtures').update({
      home_score: Number(homeScore), away_score: Number(awayScore), status: 'completed',
    }).eq('id', fixtureId)
    setScoreEditing(s => { const n = { ...s }; delete n[fixtureId]; return n })
    loadFixtures()
  }

  const byRound = fixtures.reduce<Record<number, LeagueFixture[]>>((acc, f) => {
    if (!acc[f.round_number]) acc[f.round_number] = []
    acc[f.round_number].push(f)
    return acc
  }, {})

  const POINTS_FIELDS: Array<[keyof SeasonForm, string]> = [
    ['win_points', 'Za zmago'], ['draw_points', 'Za neriješeno'], ['loss_points', 'Za poraz'],
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Upravljanje lige</h1>
          <p className="text-sm text-gray-500">Državno ekipno prvenstvo</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="bg-bocce-green text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-bocce-green-light transition-colors">
          + Nova sezona
        </button>
      </div>

      {message && (
        <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-green-50 text-green-700 border border-green-200">{message}</div>
      )}

      {showCreate && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
          <h2 className="font-semibold text-gray-800 mb-4">Nova sezona</h2>
          <form onSubmit={createSeason} className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Ime sezone *</label>
              <input required type="text" value={form.name} onChange={set('name')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none"
                placeholder="Super Liga 2025" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Leto *</label>
              <input required type="number" value={form.year} onChange={set('year')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Rang *</label>
              <select value={form.tier} onChange={set('tier')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                {(Object.entries(TIER_LABELS) as [LeagueTier, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            {form.tier === 'obz' && (
              <div>
                <label className="block text-xs text-gray-600 mb-1">Območna zveza *</label>
                <select value={form.obz_name} onChange={set('obz_name')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                  <option value="">Izberi OBZ...</option>
                  {OBZ_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-600 mb-1">Kategorija</label>
              <select value={form.category} onChange={set('category')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                <option value="men">Moški</option>
                <option value="women">Ženske</option>
                <option value="u18">U18</option>
                <option value="u18_women">U18 Ženske</option>
                <option value="u15">U15</option>
                <option value="u12">U12</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Krogi (1 = enkrat, 2 = dom/gost)</label>
              <select value={form.rounds_count} onChange={set('rounds_count')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                <option value={1}>Enokrožno</option>
                <option value={2}>Dvokrožno (dom + gost)</option>
              </select>
            </div>
            <div className="flex gap-3">
              {POINTS_FIELDS.map(([k, l]) => (
                <div key={k} className="flex-1">
                  <label className="block text-xs text-gray-600 mb-1">{l}</label>
                  <input type="number" min="0" max="3" value={form[k] as number} onChange={set(k)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none" />
                </div>
              ))}
            </div>
            <div className="col-span-full flex gap-3">
              <button type="submit" disabled={loading}
                className="bg-bocce-green text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-bocce-green-light disabled:opacity-50">
                {loading ? 'Ustvarjam...' : 'Ustvari'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)}
                className="border border-gray-300 text-gray-600 px-5 py-2 rounded-lg text-sm hover:bg-gray-50">
                Prekliči
              </button>
            </div>
          </form>
        </div>
      )}

      {seasons.length > 0 && (() => {
        const rest = seasons.filter(s => !LEAGUE_COLUMNS.some(c => c.match(s)))
        const cols = [
          ...LEAGUE_COLUMNS.map(c => ({ label: c.label, list: seasons.filter(c.match) })),
          ...(rest.length ? [{ label: 'Ostalo', list: rest }] : []),
        ].filter(c => c.list.length > 0)
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5 mb-6">
            {cols.map(col => (
              <div key={col.label} className="bg-gray-50 border border-gray-200 rounded-xl p-2">
                <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide px-1 mb-1.5 truncate" title={col.label}>
                  {col.label}
                </div>
                <div className="space-y-1.5">
                  {col.list.slice().sort((a, b) => b.year - a.year).map(s => (
                    <button key={s.id} onClick={() => setSelectedSeason(s)} title={s.name}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors truncate
                        ${selectedSeason?.id === s.id ? 'bg-bocce-green text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'}`}>
                      {seasonShort(s.name)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      })()}

      {selectedSeason && (
        <>
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <span className="font-semibold text-gray-800">{selectedSeason.name}</span>
              <span className="ml-3 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                {selectedSeason.status === 'draft' ? 'Osnutek' : selectedSeason.status === 'active' ? 'Aktivna' : 'Zaključena'}
              </span>
            </div>
            <div className="flex gap-2">
              {selectedSeason.status === 'draft' && (
                <button onClick={() => updateSeasonStatus('active')}
                  className="text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100">
                  Aktiviraj sezono
                </button>
              )}
              {selectedSeason.status === 'active' && (
                <button onClick={() => updateSeasonStatus('completed')}
                  className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100">
                  Zaključi sezono
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-1 mb-6 border-b border-gray-200">
            {[
              { key: 'teams' as const, label: `Ekipe (${teams.length})` },
              { key: 'fixtures' as const, label: `Tekme (${fixtures.length})` },
              { key: 'discipline' as const, label: `Discipline (${disciplines.length})` },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px
                  ${tab === t.key ? 'border-bocce-green text-bocce-green' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'teams' && (
            <div>
              <form onSubmit={addTeam} className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-xs text-gray-600 mb-1">Klub *</label>
                  <input required type="text" value={teamForm.club_name} onChange={setTeamField('club_name')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none"
                    placeholder="KBP Ljubljana" />
                </div>
                <div className="w-24">
                  <label className="block text-xs text-gray-600 mb-1">Okrajšava</label>
                  <input type="text" value={teamForm.short_name} onChange={setTeamField('short_name')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none"
                    placeholder="LJU" maxLength={5} />
                </div>
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs text-gray-600 mb-1">Kapitan</label>
                  <select value={teamForm.captain_id} onChange={setTeamField('captain_id')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                    <option value="">Brez</option>
                    {players.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </select>
                </div>
                <button type="submit" disabled={loading}
                  className="bg-bocce-green text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-bocce-green-light disabled:opacity-50">
                  Dodaj ekipo
                </button>
              </form>

              <div className="space-y-4">
                {teams.map(team => (
                  <div key={team.id} className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 text-xs text-gray-500" title="Žrebana številka">
                          <span className="font-mono text-gray-400">#</span>
                          <input type="number" min={1} max={teams.length}
                            value={team.draw_number ?? ''}
                            onChange={e => changeDrawNumber(team.id, e.target.value)}
                            className="w-12 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center focus:ring-2 focus:ring-bocce-green outline-none"
                            placeholder="–" />
                        </label>
                        <span className="font-semibold text-gray-800">{team.club_name}</span>
                        {team.short_name && <span className="ml-1 text-xs text-gray-400">({team.short_name})</span>}
                        {team.captain && <span className="ml-2 text-xs text-gray-500">Kapitan: {team.captain.full_name}</span>}
                      </div>
                      <button onClick={() => removeTeam(team.id)} className="text-xs text-red-400 hover:text-red-600">Izbriši</button>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {team.league_team_players?.map(p => (
                        <span key={p.id} className="flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full">
                          {p.player?.full_name}
                          <button onClick={() => removePlayerFromTeam(p.id)} className="text-gray-400 hover:text-red-500 ml-1">×</button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <select className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white"
                        defaultValue=""
                        onChange={e => { if (e.target.value) addPlayerToTeam(team.id, e.target.value); e.target.value = '' }}>
                        <option value="">+ Dodaj igralca</option>
                        {players.filter(p => !team.league_team_players?.some(tp => tp.player_id === p.id))
                          .map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'discipline' && (
            <div>
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-2 mb-5">
                <button onClick={() => setShowAddDisc(v => !v)}
                  className="text-xs bg-bocce-green text-white px-3 py-1.5 rounded-lg hover:bg-bocce-green-light">
                  + Dodaj disciplino
                </button>
                <button onClick={() => seedDisciplines(selectedSeason.id, selectedSeason.tier).then(loadDisciplines)}
                  className="text-xs border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                  ↺ Ponastavi na privzete
                </button>
                <div className="flex items-center gap-2 ml-auto">
                  <select value={copyFromSeasonId} onChange={e => setCopyFromSeasonId(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                    <option value="">Kopiraj iz sezone…</option>
                    {seasons.filter(s => s.id !== selectedSeason.id).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <button disabled={!copyFromSeasonId || loading}
                    onClick={() => copyDisciplinesFromSeason(copyFromSeasonId)}
                    className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-40">
                    Kopiraj
                  </button>
                </div>
              </div>

              {/* Add discipline form */}
              {showAddDisc && (
                <form onSubmit={addDiscipline}
                  className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-5 grid sm:grid-cols-2 gap-3">
                  <div className="col-span-full">
                    <label className="block text-xs text-gray-600 mb-1">Ime discipline *</label>
                    <input required type="text" value={discForm.name}
                      onChange={e => setDiscForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none"
                      placeholder="npr. POSAMEZNO 4" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Tip</label>
                    <select value={discForm.discipline_type}
                      onChange={e => setDiscForm(f => ({ ...f, discipline_type: e.target.value as DisciplineType }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                      <option value="posamezno">Posamezno</option>
                      <option value="krog">Krog</option>
                      <option value="hitrostno">Hitrostno zbijanje</option>
                      <option value="natancno">Natančno zbijanje</option>
                      <option value="blizanje">Natančno bližanje</option>
                      <option value="blizanje_krog">Bližanje v krog</option>
                      <option value="stafeta">Štafeta</option>
                      <option value="dvojka">Dvojka</option>
                      <option value="trojka">Trojka</option>
                      <option value="podaljsek">Podaljšek</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Blok</label>
                    <select value={discForm.block_number}
                      onChange={e => setDiscForm(f => ({ ...f, block_number: Number(e.target.value) }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                      {[1, 2, 3, 4].map(b => (
                        <option key={b} value={b}>{BLOCK_LABELS[b] ?? `Blok ${b}`}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Igralci na stran</label>
                    <select value={discForm.players_per_side}
                      onChange={e => setDiscForm(f => ({ ...f, players_per_side: Number(e.target.value) }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                      <option value={1}>1 (posamezno)</option>
                      <option value={2}>2 (dvojka)</option>
                      <option value={3}>3 (trojka)</option>
                      <option value={4}>4 (štafeta)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Vrstni red</label>
                    <input type="number" min="1" value={discForm.order_num}
                      onChange={e => setDiscForm(f => ({ ...f, order_num: Number(e.target.value) }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none" />
                  </div>
                  <div className="flex items-center gap-2 pt-4">
                    <input type="checkbox" id="has_reserve" checked={discForm.has_reserve}
                      onChange={e => setDiscForm(f => ({ ...f, has_reserve: e.target.checked }))}
                      className="rounded" />
                    <label htmlFor="has_reserve" className="text-xs text-gray-600">Rezervni igralec</label>
                  </div>
                  <div className="col-span-full flex gap-2">
                    <button type="submit" disabled={loading}
                      className="bg-bocce-green text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-bocce-green-light disabled:opacity-50">
                      Dodaj
                    </button>
                    <button type="button" onClick={() => setShowAddDisc(false)}
                      className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
                      Prekliči
                    </button>
                  </div>
                </form>
              )}

              {/* Discipline list */}
              {disciplines.length === 0 ? (
                <div className="text-center py-8 text-gray-400 italic text-sm">
                  Ni disciplin. Dodaj ročno, kopiraj iz druge sezone ali klikni "Ponastavi na privzete".
                </div>
              ) : (() => {
                const blocks = disciplines.reduce<Record<number, typeof disciplines>>((acc, d) => {
                  const b = d.block_number ?? 1
                  if (!acc[b]) acc[b] = []
                  acc[b].push(d)
                  return acc
                }, {})
                return Object.keys(blocks).map(Number).sort((a, b) => a - b).map(blockNum => (
                  <div key={blockNum} className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
                        ${blockNum === 1 ? 'bg-bocce-green text-white' : blockNum === 2 ? 'bg-blue-500 text-white' : blockNum === 3 ? 'bg-orange-500 text-white' : 'bg-bocce-gold text-bocce-green'}`}>
                        {blockNum}
                      </span>
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        {BLOCK_LABELS[blockNum] ?? `Blok ${blockNum}`}
                      </span>
                    </div>
                    <div className="space-y-1 pl-8">
                      {blocks[blockNum].map(d => (
                        <div key={d.id} className="bg-white border border-gray-200 rounded-lg px-4 py-2 flex items-center gap-3">
                          <span className="w-6 text-center text-xs text-gray-400">{d.order_num}</span>
                          <span className="font-medium text-sm text-gray-800 flex-1">{d.name}</span>
                          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                            {d.players_per_side === 1 ? 'posamezno' : d.players_per_side === 2 ? 'dvojka' : d.players_per_side === 3 ? 'trojka' : 'štafeta'}
                            {d.has_reserve ? ' + R' : ''}
                          </span>
                          <button onClick={() => toggleDiscipline(d)} className="text-xs text-red-400 hover:text-red-600">Izbriši</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              })()}
            </div>
          )}

          {tab === 'fixtures' && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <button onClick={handleGenerateFixtures} disabled={loading || teams.length < 2}
                  className="bg-bocce-green text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-bocce-green-light disabled:opacity-50">
                  {loading ? 'Generiram...' : fixtures.length > 0 ? '↺ Regeneriraj razpored' : 'Ustvari razpored'}
                </button>
                <span className="text-xs text-gray-500">
                  Bergerjev sistem · {selectedSeason.rounds_count > 1 ? 'Dvokrožno' : 'Enokrožno'} · {teams.length} ekip
                </span>
              </div>
              <p className="text-xs text-gray-400 -mt-4 mb-6">
                Razpored se sestavi po žrebanih številkah ekip (zavihek Ekipe → polje <span className="font-mono">#</span>).
              </p>

              {Object.entries(byRound).sort(([a], [b]) => Number(a) - Number(b)).map(([round, rFixtures]) => (
                <div key={round} className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">{round}. kolo</h3>
                  <div className="space-y-2">
                    {rFixtures.map(f => {
                      const editing = scoreEditing[f.id]
                      return (
                        <div key={f.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
                          <span className="flex-1 text-right text-sm font-medium text-gray-800">{f.home_team?.club_name}</span>
                          <div className="text-center min-w-[100px]">
                            {editing ? (
                              <div className="flex items-center gap-1">
                                <input type="number" min="0" value={editing.home}
                                  onChange={e => setScoreEditing(s => ({ ...s, [f.id]: { ...s[f.id], home: e.target.value } }))}
                                  className="w-10 border border-gray-300 rounded px-1 py-0.5 text-center text-sm font-bold" />
                                <span className="text-gray-400">:</span>
                                <input type="number" min="0" value={editing.away}
                                  onChange={e => setScoreEditing(s => ({ ...s, [f.id]: { ...s[f.id], away: e.target.value } }))}
                                  className="w-10 border border-gray-300 rounded px-1 py-0.5 text-center text-sm font-bold" />
                                <button onClick={() => saveScore(f.id, editing.home, editing.away)}
                                  className="ml-1 text-bocce-green text-xs font-bold">✓</button>
                                <button onClick={() => setScoreEditing(s => { const n = { ...s }; delete n[f.id]; return n })}
                                  className="text-gray-400 text-xs">✕</button>
                              </div>
                            ) : f.status === 'completed' ? (
                              <button
                                onClick={() => setScoreEditing(s => ({ ...s, [f.id]: { home: String(f.home_score ?? ''), away: String(f.away_score ?? '') } }))}
                                className="font-bold text-gray-800 text-lg font-mono hover:text-bocce-green">
                                {f.home_score} : {f.away_score}
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">–</span>
                            )}
                          </div>
                          <span className="flex-1 text-left text-sm font-medium text-gray-800">{f.away_team?.club_name}</span>
                          <Link to={`/liga/tekma/${f.id}`}
                            className="text-xs bg-bocce-green text-white px-3 py-1.5 rounded-lg hover:bg-bocce-green-light whitespace-nowrap">
                            Zapisnik
                          </Link>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
