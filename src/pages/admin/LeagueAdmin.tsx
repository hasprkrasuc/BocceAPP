import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabase'
import { USER_PUBLIC_COLS } from '../../lib/userColumns'
import { fetchAllRows } from '../../lib/fetchAllRows'
import { bergerFixtures, MAX_BERGER_TEAMS } from '../../engines/berger'
import { phase2Fixtures, validateDraw, type Phase2Team } from '../../engines/leagueGroups'
import {
  splitGroups, splitPhase2Fixtures, validateSplitPhase1,
  SPLIT_TEAMS, SPLIT_GROUP_SIZE, SPLIT_PHASE1_ROUNDS, SPLIT_PHASE2_ROUNDS,
  SPLIT_TOP, SPLIT_BOTTOM,
} from '../../engines/leagueSplit'
import { calculateStandings, calculateSplitStandings, type MatchResultWithDisc } from '../../engines/league'
import { DEFAULT_DISCIPLINES, BLOCK_LABELS } from '../../engines/leagueDisciplines'
import { toDateTimeLocal, skupniTerminKola, povzetekTerminovKola } from '../../lib/matchDate'
import { useAuth } from '../../contexts/AuthContext'
import type { LeagueSeason, LeagueTeam, LeagueFixture, LeagueSeasonStatus, LeagueSeasonFormat, LeagueCategory, LeagueTier, LeagueSeasonDiscipline, UserProfile, DisciplineType } from '../../types'

const FORMAT_LABELS: Record<LeagueSeasonFormat, string> = {
  flat: 'Raven round robin',
  groups: 'Skupine 2×6 + nadaljevalni',
  split: 'Razdelitev 10 (9 kol + 5)',
}

/** Predlog razdelitve po 9 kolih: po pet ekip v vsaki skupini. */
interface SplitDraft {
  top: string[]
  bottom: string[]
}

/** Sklop 6 žrebanih številk ene skupine faze 2 ('1-6' uporabi mesta 1-3, '7-12' mesta 4-6). */
type Phase2Slot = [string, string, string]

interface Phase2Draft {
  a16: Phase2Slot
  b16: Phase2Slot
  a712: Phase2Slot
  b712: Phase2Slot
}

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
  { label: 'Območne lige', match: s => s.tier === 'obz' },
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
  format: LeagueSeasonFormat
  rounds_count: number
  win_points: number
  draw_points: number
  loss_points: number
  berger_mirror: boolean
  double_round: boolean
}

interface TeamForm {
  club_name: string
  short_name: string
  captain_id: string
}

type ScoreEditing = Record<string, { home: string; away: string }>

export default function LeagueAdmin() {
  const { isAdmin, managedSeasonIds } = useAuth()
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
    category: 'men', format: 'flat', rounds_count: 1, win_points: 2, draw_points: 1, loss_points: 0,
    berger_mirror: false, double_round: false,
  })
  const [teamForm, setTeamForm] = useState<TeamForm>({ club_name: '', short_name: '', captain_id: '' })
  const [scoreEditing, setScoreEditing] = useState<ScoreEditing>({})
  const [phase2Draft, setPhase2Draft] = useState<Phase2Draft | null>(null)
  const [splitDraft, setSplitDraft] = useState<SplitDraft | null>(null)
  /** Vnos termina po kolih, dokler ni potrjen (ključ = številka kola). */
  const [roundDateDraft, setRoundDateDraft] = useState<Record<string, string>>({})
  const [leagueAdmins, setLeagueAdmins] = useState<{ user_id: string }[]>([])
  const [newLeagueAdminId, setNewLeagueAdminId] = useState('')
  /** Disciplinski rezultati — nujni za pravilno uvrstitev ob izenačenju (razlika iger).
   *  Nalagajo se SAMO za format='groups' (drugje jih ta stran ne potrebuje). */
  const [matchResults, setMatchResults] = useState<MatchResultWithDisc[]>([])
  const [matchResultsLoaded, setMatchResultsLoaded] = useState(false)
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
  useEffect(() => {
    if (!selectedSeason) return
    // ob menjavi sezone razveljavi rezultate prejšnje, da predlog faze 2 ne more
    // teči nad tujimi/zastarelimi podatki
    setMatchResults([])
    setMatchResultsLoaded(false)
    setPhase2Draft(null)
    loadTeams(); loadFixtures(); loadDisciplines(); loadLeagueAdmins()
  }, [selectedSeason])
  useEffect(() => {
    // Igralcev je vec kot 1000, PostgREST pa toliko vrne na poizvedbo. Brez
    // stranjenja sta spustna menija (vodja ekipe in dodajanje igralca) tiho
    // izpuscala zadnjih nekaj sto igralcev po abecedi.
    fetchAllRows<Pick<UserProfile, 'id' | 'full_name' | 'club'>>((od, doVkljucno) =>
      supabase.from('users').select('id, full_name, club').order('full_name').range(od, doVkljucno))
      .then(setPlayers)
      .catch(e => setMessage(`⚠ Seznama igralcev ni bilo mogoče naložiti: ${(e as Error).message}`))
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
    const vse = (data ?? []) as LeagueSeason[]
    // Ligaški admin vidi samo svoje lige. Branje sezon je javno, zato je to
    // pospravljanje zaslona, ne varovalo — pisanje omejijo RLS politike.
    const s = isAdmin ? vse : vse.filter(x => managedSeasonIds.includes(x.id))
    setSeasons(s)
    if (s.length > 0 && !selectedSeason) setSelectedSeason(s[0])
    // Osveži tudi izbrano sezono: generator po vpisu tekem popravi rounds_count,
    // brez tega bi glava in prikaz končnice še naprej brala staro vrednost.
    else if (selectedSeason) {
      const svez = s.find(x => x.id === selectedSeason.id)
      if (svez) setSelectedSeason(svez)
    }
  }

  async function loadTeams() {
    if (!selectedSeason) return
    const { data } = await supabase.from('league_teams')
      // Izrecni stolpci namesto users(*): občutljivih stolpcev vloga
      // authenticated ne sme brati, zvezdica bi vrnila 401.
      .select(`*, captain:users(${USER_PUBLIC_COLS}), league_team_players(*, player:users(${USER_PUBLIC_COLS}))`)
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
    const fixturesRaw = (data ?? []) as LeagueFixture[]
    setFixtures(fixturesRaw)
    await loadMatchResults(fixturesRaw)
  }

  /**
   * Disciplinski rezultati sezone — enaka poizvedba in oblika kot na javni strani
   * (League.tsx), da predlog faze 2 uvrsti izenačene ekipe enako kot prikazana lestvica.
   * Brez tega bi bile vse boule vrednosti 0 in izenačenje bi padlo na sort po imenu.
   *
   * Ni potrebno straničenje: league_match_results ima eno vrstico na tekmo, skupinska
   * sezona jih ima največ 96 (60 faza 1 + 36 faza 2) — krepko pod privzeto mejo 1000.
   * Vgnezdeni league_match_discipline_results so embedded resource in jih meja
   * najvišjega nivoja ne odreže.
   */
  async function loadMatchResults(fixtureList: LeagueFixture[]) {
    if (!selectedSeason || selectedSeason.format !== 'groups') {
      setMatchResults([])
      setMatchResultsLoaded(true)
      return
    }
    if (fixtureList.length === 0) {
      setMatchResults([])
      setMatchResultsLoaded(true)
      return
    }
    const { data, error } = await supabase.from('league_match_results')
      .select('*, discipline_results:league_match_discipline_results(*)')
      .in('fixture_id', fixtureList.map(f => f.id))
    if (error) {
      setMatchResults([])
      setMatchResultsLoaded(false)
      return
    }
    setMatchResults((data ?? []) as MatchResultWithDisc[])
    setMatchResultsLoaded(true)
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
    // Brez OBZ bi območna liga na javni strani dobila generično oznako
    // "Območna liga" (League.tsx: `s.obz_name ?? 'Območna liga'`) in je od
    // drugih ne bi bilo mogoče ločiti. Po ustvarjanju je ni mogoče popraviti
    // drugače kot z ročnim SQL, zato ustavimo tu.
    if (form.tier === 'obz' && !form.obz_name) {
      setMessage('⚠ Območna liga potrebuje območno zvezo.')
      return
    }
    setLoading(true)
    const { data, error } = await supabase.from('league_seasons').insert({
      name: form.name, year: form.year, category: form.category,
      tier: form.tier, obz_name: form.tier === 'obz' ? form.obz_name : null,
      format: form.format, rounds_count: form.rounds_count, win_points: form.win_points,
      draw_points: form.draw_points, loss_points: form.loss_points,
      berger_mirror: form.berger_mirror, double_round: form.double_round,
      status: 'draft',
    }).select().single()
    if (error) {
      setMessage(`⚠ Sezone ni bilo mogoče ustvariti: ${error.message}`)
    } else if (data) {
      setMessage('')
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

  /** Vnos skupine žreba (A/B) — samo format='groups' (optimistično v UI + shrani v bazo). */
  function changeGroupLabel(teamId: string, value: string) {
    const g = value === '' ? null : (value as 'A' | 'B')
    setTeams(ts => ts.map(t => (t.id === teamId ? { ...t, group_label: g } : t)))
    supabase.from('league_teams').update({ group_label: g }).eq('id', teamId)
  }

  /** Napake žreba za format='groups' (prazno = žreb veljaven). Vsebuje tudi napačno skupno število ekip. */
  const drawErrors: string[] = selectedSeason?.format === 'groups'
    ? (teams.length !== 12
        ? [`Format "skupine" zahteva natanko 12 ekip (2×6), trenutno ${teams.length}.`]
        : validateDraw(teams.map(t => ({ id: t.id, group_label: t.group_label, draw_number: t.draw_number }))))
    : selectedSeason?.format === 'split' && teams.length !== SPLIT_TEAMS
      ? [`Razdelitveni sistem zahteva natanko ${SPLIT_TEAMS} ekip, trenutno ${teams.length}.`]
      : []

  async function handleGenerateFixtures() {
    if (!selectedSeason) return
    if (selectedSeason.format === 'groups') {
      await handleGeneratePhase1Groups()
      return
    }
    if (selectedSeason.format === 'split') {
      await handleGeneratePhase1Split()
      return
    }
    if (teams.length < 2) { setMessage('Premalo ekip za razpored'); return }
    if (teams.length > MAX_BERGER_TEAMS) {
      setMessage(`Bergerjeva tabela je na voljo do ${MAX_BERGER_TEAMS} ekip (trenutno ${teams.length}).`)
      return
    }
    // Razpored se sestavi po Bergerju iz žrebanih številk — preveri veljavnost žreba.
    // Enokrožno/dvokrožno bere iz double_round, NE iz rounds_count: ta je po
    // generiranju število kol, zato bi ga `> 1` prebral kot dvokrožno tudi pri
    // enokrožni ligi in bi vsaka regeneracija podvojila razpored.
    let fixtureList
    try {
      fixtureList = bergerFixtures(teams, selectedSeason.double_round ?? false, selectedSeason.berger_mirror ?? false)
    } catch (err) {
      setMessage(`⚠ ${err instanceof Error ? err.message : 'Napaka pri žrebu'}`)
      return
    }
    const kol = Math.max(...fixtureList.map(f => f.round_number))
    if (!window.confirm(
      `Ustvari Bergerjev razpored za ${teams.length} ekip — ` +
      `${selectedSeason.double_round ? 'dvokrožno' : 'enokrožno'}, ${kol} kol, ${fixtureList.length} tekem? ` +
      'To bo izbrisalo obstoječe tekme!'
    )) return
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
    // rounds_count = dejansko število kol rednega dela. Brez tega ostane vrednost
    // iz obrazca (1 ali 2) in vse nad njo velja za končnico: lestvica bi štela
    // samo prvi dve koli, ostalo pa bi se prikazalo kot polfinale in finale.
    await supabase.from('league_seasons').update({ rounds_count: kol }).eq('id', selectedSeason.id)
    setMessage(`✓ Ustvarjenih ${fixtureList.length} tekem v ${kol} kolih`)
    await loadFixtures()
    await loadSeasons()
    setLoading(false)
  }

  /**
   * Faza 1 za format='split': vseh 10 ekip ENOkrožno po Bergerju → 9 kol, 45 tekem.
   * Enokrožnost ni nastavitev, ampak pogoj sistema: obrat dom/gost v fazi 2 je
   * enoličen le, če se je par v fazi 1 srečal natanko enkrat.
   */
  async function handleGeneratePhase1Split() {
    if (!selectedSeason) return
    if (teams.length !== SPLIT_TEAMS) {
      setMessage(`Razdelitveni sistem zahteva natanko ${SPLIT_TEAMS} ekip, trenutno ${teams.length}.`)
      return
    }
    if (hasSplitPhase2) {
      setMessage('⚠ Faza 2 že obstaja. Najprej izbriši tekme skupin 1-5 in 6-10, sicer bi regeneracija faze 1 razveljavila razdelitev.')
      return
    }
    let fixtureList
    try {
      fixtureList = bergerFixtures(teams, false, selectedSeason.berger_mirror ?? false)
    } catch (err) {
      setMessage(`⚠ ${err instanceof Error ? err.message : 'Napaka pri žrebu'}`)
      return
    }
    if (!window.confirm(`Ustvari fazo 1 (${SPLIT_TEAMS} ekip, enokrožno, kola 1-${SPLIT_PHASE1_ROUNDS})? To bo izbrisalo obstoječe tekme!`)) return

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
    await supabase.from('league_seasons').update({ rounds_count: SPLIT_PHASE1_ROUNDS }).eq('id', selectedSeason.id)
    setMessage(`✓ Ustvarjenih ${fixtureList.length} tekem faze 1 (${SPLIT_PHASE1_ROUNDS} kol)`)
    await loadFixtures()
    await loadSeasons()
    setLoading(false)
  }

  /** Faza 1 za format='groups': ločen Bergerjev razpored za vsako skupino (A, B), 6 ekip, dvokrožno. */
  async function handleGeneratePhase1Groups() {
    if (!selectedSeason) return
    if (teams.length !== 12) {
      setMessage(`Format "skupine" zahteva natanko 12 ekip (2×6), trenutno ${teams.length}.`)
      return
    }
    const errors = validateDraw(teams.map(t => ({ id: t.id, group_label: t.group_label, draw_number: t.draw_number })))
    if (errors.length > 0) {
      setMessage(`⚠ Žreb ni veljaven:\n${errors.join('\n')}`)
      return
    }
    const hasPhase2 = fixtures.some(f => f.group_label === '1-6' || f.group_label === '7-12')
    if (hasPhase2) {
      setMessage('⚠ Faza 2 že obstaja. Najprej izbriši tekme faze 2 (regeneracija faze 1 bi jih razveljavila), šele nato lahko ponovno generiraš fazo 1.')
      return
    }

    const groupATeams = teams.filter(t => t.group_label === 'A').sort((a, b) => (a.draw_number ?? 0) - (b.draw_number ?? 0))
    const groupBTeams = teams.filter(t => t.group_label === 'B').sort((a, b) => (a.draw_number ?? 0) - (b.draw_number ?? 0))

    let fixturesA, fixturesB
    try {
      fixturesA = bergerFixtures(groupATeams, true, selectedSeason.berger_mirror ?? false)
      fixturesB = bergerFixtures(groupBTeams, true, selectedSeason.berger_mirror ?? false)
    } catch (err) {
      setMessage(`⚠ ${err instanceof Error ? err.message : 'Napaka pri žrebu'}`)
      return
    }

    if (!window.confirm('Ustvari fazo 1 (skupini A in B, 2×6 ekip, dvokrožno, kola 1-10)? To bo izbrisalo obstoječe tekme faze 1!')) return
    setLoading(true)
    await supabase.from('league_fixtures').delete().eq('season_id', selectedSeason.id).in('group_label', ['A', 'B'])
    const allFixtures = [
      ...fixturesA.map(f => ({ ...f, group_label: 'A' as const })),
      ...fixturesB.map(f => ({ ...f, group_label: 'B' as const })),
    ]
    for (const f of allFixtures) {
      await supabase.from('league_fixtures').insert({
        season_id: selectedSeason.id,
        round_number: f.round_number,
        home_team_id: f.home_team_id,
        away_team_id: f.away_team_id,
        group_label: f.group_label,
        status: 'scheduled',
      })
    }
    await supabase.from('league_seasons').update({ rounds_count: 10 }).eq('id', selectedSeason.id)
    setMessage(`✓ Ustvarjenih ${allFixtures.length} tekem faze 1 (${fixturesA.length} v skupini A, ${fixturesB.length} v skupini B, po 10 kol vsaka ekipa)`)
    await loadFixtures()
    await loadSeasons()
    setLoading(false)
  }

  // ─── Faza 2 (nadaljevalni skupini 1-6 / 7-12) — samo format='groups' ───

  const phase1FixturesA = fixtures.filter(f => f.group_label === 'A')
  const phase1FixturesB = fixtures.filter(f => f.group_label === 'B')
  const groupATeams = teams.filter(t => t.group_label === 'A')
  const groupBTeams = teams.filter(t => t.group_label === 'B')
  const hasPhase1 = phase1FixturesA.length > 0 && phase1FixturesB.length > 0
  const hasPhase2 = fixtures.some(f => f.group_label === '1-6' || f.group_label === '7-12')

  /**
   * Predlog delitve v nadaljevalni skupini po lestvici faze 1 (obstoječi calculateStandings,
   * brez novega izračuna). matchResults so OBVEZNI — nosijo razliko iger (boule), ki ob
   * izenačenju odloča o uvrstitvi; brez njih bi admin videl drugačen vrstni red kot javna
   * lestvica (League.tsx), in to ravno takrat, ko predlog odloča o napredovanju.
   */
  function proposePhase2(): Phase2Draft {
    const standingsA = calculateStandings(groupATeams, phase1FixturesA, selectedSeason, matchResults)
    const standingsB = calculateStandings(groupBTeams, phase1FixturesB, selectedSeason, matchResults)
    return {
      a16: standingsA.slice(0, 3).map(s => s.team.id) as Phase2Slot,
      b16: standingsB.slice(0, 3).map(s => s.team.id) as Phase2Slot,
      a712: standingsA.slice(3, 6).map(s => s.team.id) as Phase2Slot,
      b712: standingsB.slice(3, 6).map(s => s.team.id) as Phase2Slot,
    }
  }

  /** Tekme faze 1, ki so odigrane — te bi morale imeti disciplinske rezultate. */
  const completedPhase1 = [...phase1FixturesA, ...phase1FixturesB].filter(f => f.status === 'completed').length
  /** Odigrane tekme obstajajo, disciplinskih rezultatov pa ni → razlika iger bo povsod 0. */
  const missingDisciplineResults =
    selectedSeason?.format === 'groups' && hasPhase1 && completedPhase1 > 0 &&
    matchResultsLoaded && matchResults.length === 0

  function openPhase2Proposal() {
    if (!hasPhase1) { setMessage('Faza 1 še ni generirana.'); return }
    if (!matchResultsLoaded) {
      setMessage('⚠ Disciplinski rezultati še niso naloženi — predlog bi lahko bil napačen ob izenačenju. Poskusi znova čez trenutek.')
      return
    }
    const unfinished = [...phase1FixturesA, ...phase1FixturesB].filter(f => f.status !== 'completed').length
    if (unfinished > 0) {
      if (!window.confirm(`${unfinished} tekem faze 1 še ni odigranih — lestvica morda ni dokončna. Vseeno izračunam predlog delitve za fazo 2?`)) return
    }
    setPhase2Draft(proposePhase2())
    setMessage('')
  }

  function updatePhase2Slot(key: keyof Phase2Draft, index: 0 | 1 | 2, teamId: string) {
    setPhase2Draft(d => {
      if (!d) return d
      const slot = [...d[key]] as Phase2Slot
      slot[index] = teamId
      return { ...d, [key]: slot }
    })
  }

  function validatePhase2Draft(d: Phase2Draft): string[] {
    const errors: string[] = []
    const aAll = [...d.a16, ...d.a712]
    const bAll = [...d.b16, ...d.b712]
    const aIds = new Set(groupATeams.map(t => t.id))
    const bIds = new Set(groupBTeams.map(t => t.id))
    if (aAll.some(id => !id) || bAll.some(id => !id)) errors.push('Vsa mesta morajo biti zapolnjena.')
    if (new Set(aAll).size !== 6 || aAll.some(id => id && !aIds.has(id))) {
      errors.push('Skupina A: izbor mora vsebovati vseh 6 ekip skupine A, vsako natanko enkrat (1-6 + 7-12 skupaj).')
    }
    if (new Set(bAll).size !== 6 || bAll.some(id => id && !bIds.has(id))) {
      errors.push('Skupina B: izbor mora vsebovati vseh 6 ekip skupine B, vsako natanko enkrat (1-6 + 7-12 skupaj).')
    }
    return errors
  }

  async function confirmGeneratePhase2() {
    if (!selectedSeason || !phase2Draft) return
    const errors = validatePhase2Draft(phase2Draft)
    if (errors.length > 0) { setMessage(`⚠ ${errors.join(' ')}`); return }
    if (hasPhase2 && !window.confirm('Faza 2 že obstaja. Izbriši in ponovno ustvari tekme faze 2?')) return
    if (!window.confirm('Ustvari razpored faze 2 (kola 11-16) po potrjenem predlogu?')) return

    const toPositions = (slot: Phase2Slot): Phase2Team[] =>
      slot.map((id, i) => ({ id, position: (i + 1) as 1 | 2 | 3 }))

    let fixtures16, fixtures712
    try {
      fixtures16 = phase2Fixtures(toPositions(phase2Draft.a16), toPositions(phase2Draft.b16), '1-6', 11)
      fixtures712 = phase2Fixtures(toPositions(phase2Draft.a712), toPositions(phase2Draft.b712), '7-12', 11)
    } catch (err) {
      setMessage(`⚠ ${err instanceof Error ? err.message : 'Napaka pri generiranju faze 2'}`)
      return
    }

    setLoading(true)
    await supabase.from('league_fixtures').delete().eq('season_id', selectedSeason.id).in('group_label', ['1-6', '7-12'])
    for (const f of [...fixtures16, ...fixtures712]) {
      await supabase.from('league_fixtures').insert({
        season_id: selectedSeason.id,
        round_number: f.round_number,
        home_team_id: f.home_team_id,
        away_team_id: f.away_team_id,
        group_label: f.group_label,
        status: 'scheduled',
      })
    }
    await supabase.from('league_seasons').update({ rounds_count: 16 }).eq('id', selectedSeason.id)
    setMessage(`✓ Ustvarjenih ${fixtures16.length + fixtures712.length} tekem faze 2`)
    setPhase2Draft(null)
    await loadFixtures()
    await loadSeasons()
    setLoading(false)
  }

  // ─── Razdelitveni sistem: skupini 1-5 / 6-10 — samo format='split' ───

  const splitPhase1Fixtures = fixtures.filter(f => !f.group_label)
  const hasSplitPhase1 = selectedSeason?.format === 'split' && splitPhase1Fixtures.length > 0
  const hasSplitPhase2 = fixtures.some(f => f.group_label === SPLIT_TOP || f.group_label === SPLIT_BOTTOM)

  /** Napake, zaradi katerih razdelitve še ni mogoče izpeljati (prazno = pripravljeno). */
  const splitReadyErrors: string[] = selectedSeason?.format === 'split'
    ? validateSplitPhase1(teams, splitPhase1Fixtures)
    : []

  /**
   * Predlog razdelitve po lestvici po 9 kolih. matchResults so obvezni iz istega
   * razloga kot pri 12-ekipnem sistemu: ob izenačenju o mestu odloča razlika iger,
   * in prav to mesto lahko odloči, v katero skupino gre ekipa.
   */
  function proposeSplit(): SplitDraft {
    const lestvica = calculateSplitStandings(teams, splitPhase1Fixtures, selectedSeason, matchResults).phase1
    const { top, bottom } = splitGroups(lestvica)
    return { top: top.map(s => s.team.id), bottom: bottom.map(s => s.team.id) }
  }

  function openSplitProposal() {
    if (!hasSplitPhase1) { setMessage('Faza 1 še ni generirana.'); return }
    if (!matchResultsLoaded) {
      setMessage('⚠ Disciplinski rezultati še niso naloženi — predlog bi lahko bil napačen ob izenačenju. Poskusi znova čez trenutek.')
      return
    }
    const unfinished = splitPhase1Fixtures.filter(f => f.status !== 'completed').length
    if (unfinished > 0) {
      if (!window.confirm(`${unfinished} tekem faze 1 še ni odigranih — lestvica ni dokončna. Vseeno izračunam predlog razdelitve?`)) return
    }
    try {
      setSplitDraft(proposeSplit())
      setMessage('')
    } catch (err) {
      setMessage(`⚠ ${err instanceof Error ? err.message : 'Predloga razdelitve ni bilo mogoče izračunati'}`)
    }
  }

  function updateSplitSlot(key: keyof SplitDraft, index: number, teamId: string) {
    setSplitDraft(d => {
      if (!d) return d
      const slot = [...d[key]]
      slot[index] = teamId
      return { ...d, [key]: slot }
    })
  }

  function validateSplitDraft(d: SplitDraft): string[] {
    const errors: string[] = []
    const all = [...d.top, ...d.bottom]
    const known = new Set(teams.map(t => t.id))
    if (all.some(id => !id)) errors.push('Vsa mesta morajo biti zapolnjena.')
    if (d.top.length !== SPLIT_GROUP_SIZE || d.bottom.length !== SPLIT_GROUP_SIZE) {
      errors.push(`Vsaka skupina mora imeti natanko ${SPLIT_GROUP_SIZE} ekip.`)
    }
    if (new Set(all).size !== SPLIT_TEAMS || all.some(id => id && !known.has(id))) {
      errors.push(`Izbor mora vsebovati vseh ${SPLIT_TEAMS} ekip lige, vsako natanko enkrat.`)
    }
    return errors
  }

  async function confirmGenerateSplit() {
    if (!selectedSeason || !splitDraft) return
    const errors = validateSplitDraft(splitDraft)
    if (errors.length > 0) { setMessage(`⚠ ${errors.join(' ')}`); return }
    if (hasSplitPhase2 && !window.confirm('Faza 2 že obstaja. Izbriši in ponovno ustvari tekme skupin?')) return
    const prvo = SPLIT_PHASE1_ROUNDS + 1
    const zadnje = SPLIT_PHASE1_ROUNDS + SPLIT_PHASE2_ROUNDS
    if (!window.confirm(`Ustvari razpored faze 2 (kola ${prvo}-${zadnje}) po potrjeni razdelitvi?`)) return

    const toPositions = (ids: string[]) => ids.map((id, i) => ({ id, position: i + 1 }))
    const meetings = splitPhase1Fixtures.map(f => ({ home_team_id: f.home_team_id, away_team_id: f.away_team_id }))

    let zgoraj, spodaj
    try {
      zgoraj = splitPhase2Fixtures(toPositions(splitDraft.top), SPLIT_TOP, prvo, meetings)
      spodaj = splitPhase2Fixtures(toPositions(splitDraft.bottom), SPLIT_BOTTOM, prvo, meetings)
    } catch (err) {
      setMessage(`⚠ ${err instanceof Error ? err.message : 'Napaka pri generiranju faze 2'}`)
      return
    }

    setLoading(true)
    await supabase.from('league_fixtures').delete().eq('season_id', selectedSeason.id).in('group_label', [SPLIT_TOP, SPLIT_BOTTOM])
    for (const f of [...zgoraj, ...spodaj]) {
      await supabase.from('league_fixtures').insert({
        season_id: selectedSeason.id,
        round_number: f.round_number,
        home_team_id: f.home_team_id,
        away_team_id: f.away_team_id,
        group_label: f.group_label,
        status: 'scheduled',
      })
    }
    await supabase.from('league_seasons').update({ rounds_count: zadnje }).eq('id', selectedSeason.id)
    setMessage(`✓ Ustvarjenih ${zgoraj.length + spodaj.length} tekem faze 2 (dom/gost obrnjen glede na fazo 1)`)
    setSplitDraft(null)
    await loadFixtures()
    await loadSeasons()
    setLoading(false)
  }

  /**
   * Enokrožno/dvokrožno za obstoječo sezono. Na že vpisane tekme ne vpliva —
   * velja šele ob naslednjem generiranju, zato to tudi pove.
   */
  async function updateDoubleRound(double: boolean) {
    if (!selectedSeason) return
    await supabase.from('league_seasons').update({ double_round: double }).eq('id', selectedSeason.id)
    setSelectedSeason(s => (s ? { ...s, double_round: double } : s))
    setMessage(fixtures.length > 0
      ? `✓ Nastavljeno na ${double ? 'dvokrožno' : 'enokrožno'} — obstoječi razpored ostaja, sprememba velja ob regeneraciji.`
      : `✓ Nastavljeno na ${double ? 'dvokrožno' : 'enokrožno'}`)
    await loadSeasons()
  }

  // ─── Termin celega kola z enim klikom ───
  //
  // Termin se piše dobesedno, tako kot ga vrne <input type="datetime-local">
  // ("YYYY-MM-DDTHH:mm"), brez pretvorbe prek Date. Tako je po vsej aplikaciji
  // (lib/matchDate.ts, zapisnik tekme): kar admin vtipka, se tako shrani in tako
  // prikaže. Pretvorba prek Date bi vse obstoječe termine premaknila za uro ali dve.

  const commonRoundDate = (fs: LeagueFixture[]) => skupniTerminKola(fs.map(f => f.scheduled_date))
  const roundDateSummary = (fs: LeagueFixture[]) =>
    `${fs.length} ${fs.length === 1 ? 'tekma' : fs.length === 2 ? 'tekmi' : 'tekme'} · ${povzetekTerminovKola(fs.map(f => f.scheduled_date))}`

  /** Vpiše (ali počisti) termin vsem tekmam kola naenkrat. */
  async function setRoundSchedule(round: number, rFixtures: LeagueFixture[], vrednost: string) {
    if (!selectedSeason) return
    const brisanje = vrednost === ''
    // Opozori le, kadar bi se povozili RAZLIČNI obstoječi termini — če kolo že
    // ima enoten termin ali ga nima nobena tekma, potrjevanje samo moti.
    const obstojeci = rFixtures.filter(f => toDateTimeLocal(f.scheduled_date))
    const razlicni = new Set(obstojeci.map(f => toDateTimeLocal(f.scheduled_date)))
    const povozi = razlicni.size > 1 || (razlicni.size === 1 && !brisanje && ![...razlicni][0].startsWith(vrednost))
    if (povozi && !window.confirm(
      `${round}. kolo: ${obstojeci.length} tekem že ima termin (${razlicni.size} različnih). ` +
      `${brisanje ? 'Odstranim termin vsem?' : 'Povozim vse z novim?'}`
    )) return

    setLoading(true)
    const ids = rFixtures.map(f => f.id)
    const { error } = await supabase.from('league_fixtures')
      .update({ scheduled_date: brisanje ? null : vrednost })
      .in('id', ids)
    if (error) {
      setMessage(`⚠ Termina ni bilo mogoče shraniti: ${error.message}`)
    } else {
      setMessage(brisanje
        ? `✓ ${round}. kolo: termin odstranjen pri ${ids.length} tekmah`
        : `✓ ${round}. kolo: termin nastavljen pri ${ids.length} tekmah`)
      setRoundDateDraft(d => { const n = { ...d }; delete n[String(round)]; return n })
    }
    await loadFixtures()
    setLoading(false)
  }

  // ─── Admini posamezne lige (samo globalni admin) ───
  //
  // Tabelo league_season_admins sme spreminjati le is_admin(); ligaski admin
  // vidi le svoje vrstice. Zato si ligaski admin dostopa do tuje lige ne more
  // odpreti sam -- zapore v tem zaslonu so udobje, mejo drzi RLS.

  async function loadLeagueAdmins() {
    if (!selectedSeason) { setLeagueAdmins([]); return }
    const { data } = await supabase.from('league_season_admins')
      .select('user_id').eq('season_id', selectedSeason.id)
    setLeagueAdmins(data ?? [])
  }

  async function addLeagueAdmin() {
    if (!selectedSeason || !newLeagueAdminId) return
    setLoading(true)
    const { error } = await supabase.from('league_season_admins')
      .insert({ season_id: selectedSeason.id, user_id: newLeagueAdminId })
    setMessage(error
      ? `⚠ Admina ni bilo mogoče dodati: ${error.message}`
      : '✓ Admin lige dodan')
    setNewLeagueAdminId('')
    await loadLeagueAdmins()
    setLoading(false)
  }

  async function removeLeagueAdmin(userId: string) {
    if (!selectedSeason) return
    const ime = players.find(p => p.id === userId)?.full_name ?? userId
    if (!window.confirm(`Odvzamem ${ime} pravico urejanja te lige?`)) return
    setLoading(true)
    const { error } = await supabase.from('league_season_admins')
      .delete().eq('season_id', selectedSeason.id).eq('user_id', userId)
    setMessage(error ? `⚠ ${error.message}` : '✓ Pravica odvzeta')
    await loadLeagueAdmins()
    setLoading(false)
  }

  async function updateSeasonStatus(status: LeagueSeasonStatus) {
    if (!selectedSeason) return
    await supabase.from('league_seasons').update({ status }).eq('id', selectedSeason.id)
    loadSeasons()
  }

  /**
   * Sprememba sistema sezone (raven round robin ↔ skupine).
   *
   * Doslej sistema po ustvarjanju sezone ni bilo mogoče spremeniti — obrazec ga
   * je ponujal le ob ustvarjanju, zato je bilo treba v bazo.
   *
   * Dovoljeno samo, dokler sezona nima razporejenih tekem: oba sistema tvorita
   * razpored po svoji logiki in menjava bi obstoječega razveljavila.
   */
  async function updateSeasonFormat(format: LeagueSeasonFormat) {
    if (!selectedSeason || format === (selectedSeason.format ?? 'flat')) return

    // Štejemo v bazi, ne v stanju komponente: tekme je lahko medtem dodal kdo
    // drug, mi pa bi se odločali po zastarelem seznamu.
    const { count, error } = await supabase.from('league_fixtures')
      .select('id', { count: 'exact', head: true }).eq('season_id', selectedSeason.id)
    if (error) { setMessage(`⚠ Ni bilo mogoče preveriti tekem: ${error.message}`); return }
    if (count) {
      setMessage(`⚠ Sistema ni mogoče spremeniti: sezona ima ${count} razporejenih tekem. Najprej izbriši razpored.`)
      return
    }

    const { error: uErr } = await supabase.from('league_seasons').update({ format }).eq('id', selectedSeason.id)
    if (uErr) { setMessage(`⚠ Sistema ni bilo mogoče shraniti: ${uErr.message}`); return }

    setSelectedSeason({ ...selectedSeason, format })
    setMessage(`✓ Sistem sezone spremenjen v »${FORMAT_LABELS[format]}«`)
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
          <p className="text-sm text-gray-500">
            {isAdmin ? 'Državno ekipno prvenstvo' : `Vaše lige (${seasons.length})`}
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowCreate(true)}
            className="bg-bocce-green text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-bocce-green-light transition-colors">
            + Nova sezona
          </button>
        )}
      </div>

      {message && (
        // Opozorila v tej datoteki se ločijo po predponi ⚠ (17 mest). Doslej so
        // se vsa izrisala v zeleni škatli, torej kot uspeh — tudi "žreb ni veljaven".
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm whitespace-pre-line border ${
          message.startsWith('⚠')
            ? 'bg-red-50 text-red-700 border-red-200'
            : 'bg-green-50 text-green-700 border-green-200'
        }`}>{message}</div>
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
                <select required value={form.obz_name} onChange={set('obz_name')}
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
              <label className="block text-xs text-gray-600 mb-1">Format sezone</label>
              <select value={form.format} onChange={set('format')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                {(Object.entries(FORMAT_LABELS) as [LeagueSeasonFormat, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            {form.format === 'flat' ? (
              <div>
                <label className="block text-xs text-gray-600 mb-1">Krogi</label>
                <select value={form.double_round ? 'da' : 'ne'}
                  onChange={e => setForm(f => ({ ...f, double_round: e.target.value === 'da' }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                  <option value="ne">Enokrožno</option>
                  <option value="da">Dvokrožno (dom + gost)</option>
                </select>
                <p className="text-[11px] text-gray-400 mt-1">
                  Število kol se izračuna ob generiranju razporeda.
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-xs text-gray-600 mb-1">Krogi</label>
                <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500">
                  {form.format === 'split'
                    ? 'Nastavi se samodejno (9 po fazi 1, 14 po fazi 2)'
                    : 'Nastavi se samodejno (10 po fazi 1, 16 po fazi 2)'}
                </div>
              </div>
            )}
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={form.berger_mirror}
                onChange={e => setForm(f => ({ ...f, berger_mirror: e.target.checked }))}
                className="mt-0.5 accent-bocce-green" />
              <span className="text-xs text-gray-600">
                <span className="font-medium">Obrni dom/gost (zrcaljena Bergerjeva tabela)</span>
                <span className="block text-gray-400 mt-0.5">
                  Priloga B: v 1. krogu igra doma ekipa z nižjo žrebano številko. Nekatere zveze
                  (OBZ Nova Gorica) razpored objavljajo obrnjeno. Pari in krogi ostanejo enaki —
                  obrne se samo stran.
                </span>
              </span>
            </label>
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
                    <button key={s.id} onClick={() => setSelectedSeason(s)} title={`${s.name} · ${FORMAT_LABELS[s.format ?? 'flat']}`}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors truncate
                        ${selectedSeason?.id === s.id ? 'bg-bocce-green text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'}`}>
                      {seasonShort(s.name)}
                      {s.format === 'groups' && (
                        <span className="ml-1 text-[9px] font-bold opacity-70" title="Skupinski sistem">⚏</span>
                      )}
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
              {fixtures.length === 0 ? (
                <select
                  value={selectedSeason.format ?? 'flat'}
                  onChange={e => updateSeasonFormat(e.target.value as LeagueSeasonFormat)}
                  title="Sistem je mogoče spremeniti, dokler sezona nima razporejenih tekem"
                  className="ml-2 text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 cursor-pointer focus:ring-2 focus:ring-bocce-green outline-none">
                  {(Object.entries(FORMAT_LABELS) as [LeagueSeasonFormat, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              ) : (
                <span
                  title={`Sistema ni mogoče spremeniti: sezona ima ${fixtures.length} razporejenih tekem`}
                  className="ml-2 text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                  {FORMAT_LABELS[selectedSeason.format ?? 'flat']}
                </span>
              )}
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

          {/* Admini te lige — ureja jih lahko samo globalni admin. */}
          {isAdmin && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Admini te lige</h3>
              <p className="text-xs text-gray-400 mb-3">
                Ligaški admin ureja ekipe, razpored, termine, zapisnike in discipline <strong>samo te sezone</strong>.
                Sezone ne more ustvariti ali izbrisati, drugih lig ne vidi in adminov ne more dodajati.
              </p>
              <div className="flex gap-2 flex-wrap items-center mb-3">
                <select value={newLeagueAdminId} onChange={e => setNewLeagueAdminId(e.target.value)}
                  className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                  <option value="">– izberi uporabnika –</option>
                  {players
                    .filter(p => !leagueAdmins.some(a => a.user_id === p.id))
                    .map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.id}{p.club ? ` · ${p.club}` : ''}</option>)}
                </select>
                <button onClick={addLeagueAdmin} disabled={loading || !newLeagueAdminId}
                  className="bg-bocce-green text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-bocce-green-light disabled:opacity-50">
                  Dodaj
                </button>
              </div>
              {leagueAdmins.length === 0 ? (
                <p className="text-xs text-gray-400 italic">Ta liga nima svojega admina — ureja jo lahko le globalni admin.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {leagueAdmins.map(a => (
                    <span key={a.user_id} className="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 text-xs">
                      {players.find(p => p.id === a.user_id)?.full_name ?? a.user_id}
                      <button onClick={() => removeLeagueAdmin(a.user_id)} disabled={loading}
                        title="Odvzemi pravico" className="text-gray-400 hover:text-red-600 font-bold">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

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
              {selectedSeason.format === 'groups' && (
                <div className={`rounded-xl p-4 mb-6 border text-sm ${drawErrors.length === 0 ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                  <div className="font-semibold mb-1">
                    {drawErrors.length === 0 ? '✓ Žreb je veljaven — pripravljen za generiranje faze 1.' : 'Žreb še ni veljaven:'}
                  </div>
                  {drawErrors.length > 0 && (
                    <ul className="list-disc list-inside space-y-0.5">
                      {drawErrors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  )}
                </div>
              )}
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
                  <label className="block text-xs text-gray-600 mb-1">Vodja ekipe</label>
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
                        {selectedSeason.format === 'groups' && (
                          <label className="flex items-center gap-1 text-xs text-gray-500" title="Skupina">
                            <select value={team.group_label ?? ''}
                              onChange={e => changeGroupLabel(team.id, e.target.value)}
                              className="w-14 border border-gray-300 rounded-lg px-1 py-1 text-sm text-center bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                              <option value="">–</option>
                              <option value="A">A</option>
                              <option value="B">B</option>
                            </select>
                          </label>
                        )}
                        <label className="flex items-center gap-1 text-xs text-gray-500" title={selectedSeason.format === 'groups' ? 'Žrebna št. (1-6 znotraj skupine)' : 'Žrebana številka'}>
                          <span className="font-mono text-gray-400">#</span>
                          <input type="number" min={1} max={selectedSeason.format === 'groups' ? 6 : teams.length}
                            value={team.draw_number ?? ''}
                            onChange={e => changeDrawNumber(team.id, e.target.value)}
                            className="w-12 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center focus:ring-2 focus:ring-bocce-green outline-none"
                            placeholder="–" />
                        </label>
                        <span className="font-semibold text-gray-800">{team.club_name}</span>
                        {team.short_name && <span className="ml-1 text-xs text-gray-400">({team.short_name})</span>}
                        {team.captain && <span className="ml-2 text-xs text-gray-500">Vodja ekipe: {team.captain.full_name}</span>}
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
              {selectedSeason.format === 'flat' ? (
                <>
                  <div className="flex items-center gap-3 mb-6 flex-wrap">
                    <button onClick={handleGenerateFixtures} disabled={loading || teams.length < 2}
                      className="bg-bocce-green text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-bocce-green-light disabled:opacity-50">
                      {loading ? 'Generiram...' : fixtures.length > 0 ? '↺ Regeneriraj razpored' : 'Ustvari razpored'}
                    </button>
                    <select value={selectedSeason.double_round ? 'da' : 'ne'}
                      onChange={e => updateDoubleRound(e.target.value === 'da')}
                      disabled={loading}
                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                      <option value="ne">Enokrožno</option>
                      <option value="da">Dvokrožno (dom + gost)</option>
                    </select>
                    <span className="text-xs text-gray-500">
                      Bergerjev sistem · {teams.length} ekip
                      {fixtures.length > 0 && ` · ${selectedSeason.rounds_count} kol · ${fixtures.length} tekem`}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 -mt-4 mb-6">
                    Razpored se sestavi po žrebanih številkah ekip (zavihek Ekipe → polje <span className="font-mono">#</span>).
                    Število kol ni nastavitev — izračuna se iz razporeda ob generiranju.
                  </p>
                </>
              ) : selectedSeason.format === 'split' ? (
                <>
                  {/* FAZA 1: 10 ekip enokrožno */}
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <button onClick={handleGenerateFixtures} disabled={loading || drawErrors.length > 0 || hasSplitPhase2}
                      title={hasSplitPhase2 ? 'Faza 2 že obstaja — najprej izbriši tekme skupin' : drawErrors.length > 0 ? `Potrebnih je ${SPLIT_TEAMS} ekip` : ''}
                      className="bg-bocce-green text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-bocce-green-light disabled:opacity-50">
                      {loading ? 'Generiram...' : hasSplitPhase1 ? '↺ Regeneriraj fazo 1' : 'Generiraj fazo 1'}
                    </button>
                    <span className="text-xs text-gray-500">
                      {SPLIT_TEAMS} ekip · enokrožno · kola 1-{SPLIT_PHASE1_ROUNDS}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mb-4">
                    Razpored po žrebanih številkah (zavihek Ekipe → polje <span className="font-mono">#</span>).
                    Faza 1 je <strong>vedno enokrožna</strong> — obrat dom/gost v fazi 2 je enoličen le, če se je par srečal natanko enkrat.
                    {drawErrors.length > 0 && <span className="text-amber-600"> {drawErrors[0]}</span>}
                  </p>

                  {/* FAZA 2: razdelitev na 1-5 in 6-10 */}
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <button onClick={openSplitProposal} disabled={loading || !hasSplitPhase1 || !matchResultsLoaded}
                      title={!hasSplitPhase1 ? 'Najprej generiraj fazo 1' : !matchResultsLoaded ? 'Disciplinski rezultati se še nalagajo' : ''}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                      {!matchResultsLoaded && hasSplitPhase1 ? 'Nalagam rezultate…' : hasSplitPhase2 ? '↺ Nov predlog razdelitve' : 'Predlog razdelitve'}
                    </button>
                    <span className="text-xs text-gray-500">
                      Skupini {SPLIT_TOP} in {SPLIT_BOTTOM} · po {SPLIT_PHASE2_ROUNDS} kol · kola {SPLIT_PHASE1_ROUNDS + 1}-{SPLIT_PHASE1_ROUNDS + SPLIT_PHASE2_ROUNDS}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mb-4">
                    Najboljših {SPLIT_GROUP_SIZE} po {SPLIT_PHASE1_ROUNDS} kolih gre v skupino {SPLIT_TOP}, zadnjih {SPLIT_GROUP_SIZE} v {SPLIT_BOTTOM}.
                    V skupini vsako kolo ena ekipa počiva. <strong>Točke iz {SPLIT_PHASE1_ROUNDS} kol se prenesejo.</strong>{' '}
                    Ob izenačenju na meji med skupinama predlog popravi ročno — dokončno odloči žreb.
                  </p>

                  {splitReadyErrors.length > 0 && hasSplitPhase1 && !hasSplitPhase2 && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 mb-6 text-xs">
                      <ul className="list-disc list-inside space-y-0.5">
                        {splitReadyErrors.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>
                  )}

                  {splitDraft && (() => {
                    const errs = validateSplitDraft(splitDraft)
                    const ime = (id: string) => teams.find(t => t.id === id)?.club_name ?? '–'
                    const stolpec = (naslov: string, key: keyof SplitDraft, barva: string) => (
                      <div>
                        <div className={`text-sm font-bold mb-2 ${barva}`}>{naslov}</div>
                        <div className="space-y-2">
                          {Array.from({ length: SPLIT_GROUP_SIZE }, (_, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="w-6 text-xs text-gray-400 text-right">{key === 'top' ? i + 1 : i + 1 + SPLIT_GROUP_SIZE}.</span>
                              <select value={splitDraft[key][i] ?? ''} onChange={e => updateSplitSlot(key, i, e.target.value)}
                                className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                                <option value="">– izberi ekipo –</option>
                                {teams.map(t => <option key={t.id} value={t.id}>{t.club_name}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                    return (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                        <h3 className="font-semibold text-gray-800 mb-3">Potrdi razdelitev</h3>
                        <div className="grid sm:grid-cols-2 gap-4 mb-3">
                          {stolpec(`Skupina ${SPLIT_TOP}`, 'top', 'text-bocce-green')}
                          {stolpec(`Skupina ${SPLIT_BOTTOM}`, 'bottom', 'text-gray-600')}
                        </div>
                        {errs.length > 0 && (
                          <ul className="list-disc list-inside text-xs text-amber-700 mb-3 space-y-0.5">
                            {errs.map((e, i) => <li key={i}>{e}</li>)}
                          </ul>
                        )}
                        <div className="text-xs text-gray-500 mb-3">
                          {SPLIT_TOP} = {splitDraft.top.map(ime).join(', ')} · {SPLIT_BOTTOM} = {splitDraft.bottom.map(ime).join(', ')}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={confirmGenerateSplit} disabled={loading || errs.length > 0}
                            className="bg-bocce-green text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-bocce-green-light disabled:opacity-50">
                            {loading ? 'Ustvarjam...' : 'Potrdi in ustvari fazo 2'}
                          </button>
                          <button onClick={() => setSplitDraft(null)}
                            className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
                            Prekliči
                          </button>
                        </div>
                      </div>
                    )
                  })()}
                </>
              ) : (
                <>
                  {/* FAZA 1 */}
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <button onClick={handleGenerateFixtures} disabled={loading || drawErrors.length > 0 || hasPhase2}
                      title={hasPhase2 ? 'Faza 2 že obstaja — najprej jo izbriši' : drawErrors.length > 0 ? 'Žreb ni veljaven (zavihek Ekipe)' : ''}
                      className="bg-bocce-green text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-bocce-green-light disabled:opacity-50">
                      {loading ? 'Generiram...' : hasPhase1 ? '↺ Regeneriraj fazo 1' : 'Generiraj fazo 1'}
                    </button>
                    <span className="text-xs text-gray-500">
                      Skupine A/B · dvokrožno · 6+6 ekip · kola 1-10
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mb-4">
                    Žreb (skupina + žrebna št. 1-6) se vnese v zavihku Ekipe. {drawErrors.length > 0 && <span className="text-amber-600">Žreb trenutno ni veljaven — glej zavihek Ekipe.</span>}
                  </p>

                  {/* FAZA 2 */}
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <button onClick={openPhase2Proposal} disabled={loading || !hasPhase1 || !matchResultsLoaded}
                      title={!hasPhase1 ? 'Najprej generiraj fazo 1' : !matchResultsLoaded ? 'Disciplinski rezultati se še nalagajo' : ''}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                      {!matchResultsLoaded && hasPhase1 ? 'Nalagam rezultate…' : hasPhase2 ? '↺ Nov predlog faze 2' : 'Predlog faze 2'}
                    </button>
                    <span className="text-xs text-gray-500">
                      Nadaljevalni skupini 1-6 / 7-12 · kola 11-16
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mb-4">
                    Predlog po lestvici faze 1 (najboljše 3 → 1-6, spodnje 3 → 7-12). Admin lahko pred generiranjem ročno popravi vrstni red — dokončno izenačenje o napredovanju odloči žreb na BZS.
                  </p>
                  {missingDisciplineResults && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 mb-6 text-xs">
                      Ni disciplinskih rezultatov — vrstni red ob izenačenju morda ni dokončen; preveri ročno.
                    </div>
                  )}

                  {phase2Draft && (() => {
                    const draftErrors = validatePhase2Draft(phase2Draft)
                    const teamName = (id: string) => teams.find(t => t.id === id)?.club_name ?? '–'
                    const renderSlotGroup = (label: string, key: keyof Phase2Draft, pool: LeagueTeam[]) => (
                      <div className="mb-3">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {[0, 1, 2].map(i => (
                            <select key={i} value={phase2Draft[key][i] ?? ''}
                              onChange={e => updatePhase2Slot(key, i as 0 | 1 | 2, e.target.value)}
                              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                              <option value="">– izberi ekipo –</option>
                              {pool.map(t => <option key={t.id} value={t.id}>{t.club_name}</option>)}
                            </select>
                          ))}
                        </div>
                      </div>
                    )
                    return (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                        <h3 className="font-semibold text-gray-800 mb-3">Potrdi delitev za fazo 2</h3>
                        <div className="grid sm:grid-cols-2 gap-4 mb-3">
                          <div>
                            <div className="text-sm font-bold text-gray-700 mb-2">Skupina 1-6</div>
                            {renderSlotGroup('Iz skupine A (mesta A1-A3)', 'a16', groupATeams)}
                            {renderSlotGroup('Iz skupine B (mesta B1-B3)', 'b16', groupBTeams)}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-gray-700 mb-2">Skupina 7-12</div>
                            {renderSlotGroup('Iz skupine A (mesta A4-A6)', 'a712', groupATeams)}
                            {renderSlotGroup('Iz skupine B (mesta B4-B6)', 'b712', groupBTeams)}
                          </div>
                        </div>
                        {draftErrors.length > 0 && (
                          <ul className="list-disc list-inside text-xs text-amber-700 mb-3 space-y-0.5">
                            {draftErrors.map((e, i) => <li key={i}>{e}</li>)}
                          </ul>
                        )}
                        <div className="text-xs text-gray-500 mb-3">
                          Trenutni predlog: 1-6 = {[...phase2Draft.a16, ...phase2Draft.b16].map(teamName).join(', ')} · 7-12 = {[...phase2Draft.a712, ...phase2Draft.b712].map(teamName).join(', ')}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={confirmGeneratePhase2} disabled={loading || draftErrors.length > 0}
                            className="bg-bocce-green text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-bocce-green-light disabled:opacity-50">
                            {loading ? 'Ustvarjam...' : 'Potrdi in ustvari fazo 2'}
                          </button>
                          <button onClick={() => setPhase2Draft(null)}
                            className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
                            Prekliči
                          </button>
                        </div>
                      </div>
                    )
                  })()}
                </>
              )}

              {Object.entries(byRound).sort(([a], [b]) => Number(a) - Number(b)).map(([round, rFixtures]) => (
                <div key={round} className="mb-6">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">{round}. kolo</h3>
                    <span className="text-xs text-gray-400">{roundDateSummary(rFixtures)}</span>
                    <div className="ml-auto flex items-center gap-1.5">
                      <input type="datetime-local"
                        value={roundDateDraft[round] ?? commonRoundDate(rFixtures)}
                        onChange={e => setRoundDateDraft(d => ({ ...d, [round]: e.target.value }))}
                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-bocce-green outline-none" />
                      <button
                        onClick={() => setRoundSchedule(Number(round), rFixtures, roundDateDraft[round] ?? commonRoundDate(rFixtures))}
                        disabled={loading || !(roundDateDraft[round] ?? commonRoundDate(rFixtures))}
                        title={`Vpiši ta datum in uro vsem ${rFixtures.length} tekmam ${round}. kola`}
                        className="bg-bocce-green text-white px-2.5 py-1 rounded-lg text-xs font-medium hover:bg-bocce-green-light disabled:opacity-40">
                        Nastavi celemu kolu
                      </button>
                      {rFixtures.some(f => f.scheduled_date) && (
                        <button onClick={() => setRoundSchedule(Number(round), rFixtures, '')}
                          disabled={loading}
                          title="Odstrani datum vsem tekmam tega kola"
                          className="border border-gray-300 text-gray-500 px-2 py-1 rounded-lg text-xs hover:bg-gray-50 disabled:opacity-40">
                          Počisti
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {rFixtures.map(f => {
                      const editing = scoreEditing[f.id]
                      return (
                        <div key={f.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
                          {f.group_label && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 min-w-[30px] text-center">
                              {f.group_label}
                            </span>
                          )}
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
