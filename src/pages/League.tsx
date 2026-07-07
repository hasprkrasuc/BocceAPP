import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { USER_PUBLIC_COLS } from '../lib/userColumns'
import { useAuth } from '../contexts/AuthContext'
import LeagueTable from '../components/LeagueTable'
import { calculateStandings, calculateGroupStandings, getFixturesByRound } from '../engines/league'
import { pickLeagueTreeSeasons, type LeagueTreeSlot } from '../engines/leagueTree'
import { format } from 'date-fns'
import { sl as dateSl } from 'date-fns/locale'
import type { LeagueSeason, LeagueTeam, LeagueFixture, LeagueSeasonStatus, LeagueTier, LeagueMatchResult, LeagueMatchDisciplineResult, LeagueSeasonDiscipline } from '../types'
import { LeagueStatsPanel, LeagueRangPanel } from '../components/LeagueStats'
import { resolvePlayerNames, type ResolvedPlayer } from '../lib/playerNames'
import { matchDatePart, matchTimePart } from '../lib/matchDate'

const STATUS_LABELS: Record<LeagueSeasonStatus, string> = {
  draft: 'Osnutek', active: 'Aktivna', completed: 'Zaključena',
}
const STATUS_COLORS: Record<LeagueSeasonStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-blue-100 text-blue-700',
}

const TIER_LABELS: Record<LeagueTier, string> = {
  super_liga: 'Super Liga',
  '1_liga': '1. Liga',
  '2_liga_zahod': '2. Liga Zahod',
  '2_liga_vzhod': '2. Liga Vzhod',
  obz: 'Območna liga',
}
const TIER_ORDER: LeagueTier[] = ['super_liga', '1_liga', '2_liga_zahod', '2_liga_vzhod', 'obz']
const TIER_COLORS: Record<LeagueTier, string> = {
  super_liga: 'border-bocce-gold bg-bocce-gold/5',
  '1_liga': 'border-bocce-green bg-bocce-green/5',
  '2_liga_zahod': 'border-blue-300 bg-blue-50/50',
  '2_liga_vzhod': 'border-blue-300 bg-blue-50/50',
  obz: 'border-gray-200 bg-white',
}

// ──────────────────────────────────────────────────────────────
// LEAGUE LIST
// ──────────────────────────────────────────────────────────────
type SeasonWithCount = LeagueSeason & { league_teams?: Array<{ count: number }> }

// Postavitev v ligaškem drevesu: oznaka, podnaslov in barva roba/pike po ravni
const SLOT_META: Record<LeagueTreeSlot, { label: string; sub: string; border: string; dot: string }> = {
  super_liga:      { label: 'Super Liga',         sub: 'moški',    border: 'border-bocce-gold',  dot: 'bg-bocce-gold' },
  '1_liga':        { label: '1. Liga',            sub: 'moški',    border: 'border-bocce-green', dot: 'bg-bocce-green' },
  '2_liga_vzhod':  { label: '2. Liga Vzhod',      sub: 'moški',    border: 'border-blue-300',    dot: 'bg-blue-400' },
  '2_liga_zahod':  { label: '2. Liga Zahod',      sub: 'moški',    border: 'border-blue-300',    dot: 'bg-blue-400' },
  '1_liga_zenske': { label: '1. Liga – Članice',  sub: 'ženske',   border: 'border-pink-300',    dot: 'bg-pink-400' },
  u14:             { label: 'U14',                sub: 'mladinci', border: 'border-orange-300',  dot: 'bg-orange-400' },
  u18:             { label: 'U18',                sub: 'mladinci', border: 'border-orange-300',  dot: 'bg-orange-400' },
}

function LeagueBox({ slot, season }: { slot: LeagueTreeSlot; season: SeasonWithCount | null }) {
  const m = SLOT_META[slot]
  const inner = (
    <>
      <div className="flex items-center gap-2">
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${m.dot}`} />
        <span className="font-bold text-gray-800">{m.label}</span>
        <span className="text-xs text-gray-400">· {m.sub}</span>
      </div>
      {season ? (
        <div className="mt-1.5 flex items-center justify-end gap-3">
          <span className="text-xs text-gray-500">{season.league_teams?.[0]?.count ?? 0} ekip</span>
        </div>
      ) : (
        <div className="mt-1.5 text-xs text-gray-400 italic">Ni razpisane sezone</div>
      )}
    </>
  )
  const base = `block w-full border-2 rounded-xl px-4 py-3 transition-all ${m.border}`
  return season
    ? <Link to={`/liga/${season.id}`} className={`${base} bg-white hover:shadow-md`}>{inner}</Link>
    : <div className={`${base} bg-gray-50 opacity-60`}>{inner}</div>
}

const Connector = () => <div className="w-0.5 h-5 bg-gray-300" />

/** Oznaka sezone iz imena (npr. "2025/26"); fallback na leto. */
const seasonLabel = (s: { name: string; year: number }): string =>
  s.name.match(/\d{4}\/\d{2,4}/)?.[0] ?? String(s.year)

/** Ligaško drevo za eno sezono: moška piramida + ženska liga + mladinske lige. */
function LeagueTreeView({ tree }: { tree: Record<LeagueTreeSlot, SeasonWithCount | null> }) {
  return (
    <>
      {/* Moška piramida (levo) + ženska liga (desno) */}
      <div className="grid lg:grid-cols-[1fr_280px] gap-8 items-start">
        <div className="flex flex-col items-center">
          <div className="w-full max-w-sm"><LeagueBox slot="super_liga" season={tree.super_liga} /></div>
          <Connector />
          <div className="w-full max-w-sm"><LeagueBox slot="1_liga" season={tree['1_liga']} /></div>
          <Connector />
          <div className="grid grid-cols-2 gap-3 w-full max-w-md">
            <LeagueBox slot="2_liga_vzhod" season={tree['2_liga_vzhod']} />
            <LeagueBox slot="2_liga_zahod" season={tree['2_liga_zahod']} />
          </div>
        </div>

        <div>
          <div className="text-xs font-bold text-gray-400 tracking-wide mb-2">ŽENSKE</div>
          <LeagueBox slot="1_liga_zenske" season={tree['1_liga_zenske']} />
        </div>
      </div>

      {/* Mladinske lige (spodaj) */}
      <div className="mt-10 pt-8 border-t border-dashed border-gray-200">
        <h2 className="text-sm font-bold text-gray-500 tracking-wide mb-3">MLADINSKE LIGE</h2>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <LeagueBox slot="u14" season={tree.u14} />
          <LeagueBox slot="u18" season={tree.u18} />
        </div>
      </div>
    </>
  )
}

export function LeagueList() {
  const [seasons, setSeasons] = useState<SeasonWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<Set<string>>(new Set())

  useEffect(() => {
    supabase.from('league_seasons').select('*, league_teams(count)').order('year', { ascending: false })
      .then(({ data }) => {
        const list = (data ?? []) as SeasonWithCount[]
        setSeasons(list)
        const labels = [...new Set(list.map(seasonLabel))].sort((a, b) => b.localeCompare(a))
        if (labels[0]) setOpen(new Set([labels[0]]))   // najnovejša sezona privzeto odprta
        setLoading(false)
      })
  }, [])

  // Skupine sezon po oznaki (npr. 2025/26), najnovejša prva; za vsako svoje drevo.
  const groups = [...new Set(seasons.map(seasonLabel))]
    .sort((a, b) => b.localeCompare(a))
    .map(label => ({ label, tree: pickLeagueTreeSeasons(seasons.filter(s => seasonLabel(s) === label)) }))

  const toggle = (label: string) => setOpen(prev => {
    const next = new Set(prev)
    if (next.has(label)) next.delete(label); else next.add(label)
    return next
  })

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Državne lige</h1>
      <p className="text-sm text-gray-500 mb-6">Izberi sezono, da se odpre drevo z vsemi ligami.</p>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
      ) : groups.length === 0 ? (
        <p className="text-gray-400 italic">Ni razpisanih lig.</p>
      ) : (
        <div className="space-y-3">
          {groups.map(({ label, tree }) => {
            const isOpen = open.has(label)
            return (
              <div key={label} className="border border-gray-200 rounded-2xl overflow-hidden bg-white">
                <button
                  onClick={() => toggle(label)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <span className="text-lg font-bold text-gray-800">Sezona {label}</span>
                  <span className={`text-gray-400 text-sm transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
                </button>
                {isOpen && (
                  <div className="px-5 pb-8 pt-4 border-t border-gray-100">
                    <LeagueTreeView tree={tree} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// FIXTURE ROW (shared between regular rounds and playoff)
// ──────────────────────────────────────────────────────────────
const GROUP_BADGE: Record<string, string> = {
  'A':    'bg-bocce-green/10 text-bocce-green',
  'B':    'bg-blue-100 text-blue-700',
  '1-6':  'bg-bocce-gold/20 text-yellow-700',
  '7-12': 'bg-gray-100 text-gray-500',
}

function WhistleIcon({ className }: { className?: string }) {
  // preprosta ikona piščalke
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M3 8a1 1 0 0 1 1-1h8.2l3.8-2.4V9.1A6 6 0 1 1 9.3 16H4a1 1 0 0 1-1-1V8zm7 3.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z" />
    </svg>
  )
}

function FixtureRow({ f, myTeamId, showGroup }: { f: LeagueFixture; myTeamId?: string; showGroup?: boolean }) {
  const isMyMatch = f.home_team_id === myTeamId || f.away_team_id === myTeamId
  const time = matchTimePart(f.scheduled_date)
  const chief = f.chief_judge?.full_name
  const hasBanner = !!(time || f.venue || chief)
  return (
    <Link to={`/admin/liga/tekma/${f.id}`}
      className={`block bg-white border rounded-xl overflow-hidden transition-colors hover:bg-gray-50 group
        ${isMyMatch ? 'border-bocce-green/30 bg-bocce-green/5 hover:bg-bocce-green/10' : 'border-gray-200'}`}>
      <div className="flex items-center gap-4 px-5 py-3">
        <div className="flex-1 text-right">
          <span className={`font-medium text-sm ${f.home_team_id === myTeamId ? 'text-bocce-green' : 'text-gray-800'}`}>
            {f.home_team?.club_name}
          </span>
        </div>
        <div className="text-center min-w-[80px]">
          {f.status === 'completed' ? (
            <span className="font-bold text-gray-800 text-lg font-mono">
              {f.home_score} : {f.away_score}
            </span>
          ) : (
            <div className="text-xs text-gray-400">
              {f.scheduled_date ? matchDatePart(f.scheduled_date) : 'ni urnika'}
            </div>
          )}
        </div>
        <div className="flex-1 text-left">
          <span className={`font-medium text-sm ${f.away_team_id === myTeamId ? 'text-bocce-green' : 'text-gray-800'}`}>
            {f.away_team?.club_name}
          </span>
        </div>
        {showGroup && f.group_label && (
          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded min-w-[30px] text-center ${GROUP_BADGE[f.group_label] ?? 'bg-gray-100 text-gray-500'}`}>
            {f.group_label}
          </span>
        )}
        <span className="text-gray-300 group-hover:text-gray-400 text-xs">›</span>
      </div>
      {hasBanner && (
        <div className="flex items-center justify-between gap-2 px-4 py-1.5 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
          <span className="flex items-center gap-2 min-w-0">
            {time && <span className="font-medium text-gray-600 whitespace-nowrap">{time}</span>}
            {f.venue && <span className="truncate">📍 {f.venue}</span>}
          </span>
          {chief && (
            <span className="flex items-center gap-1 whitespace-nowrap text-gray-600">
              <WhistleIcon className="w-3.5 h-3.5 text-bocce-green" />
              {chief}
            </span>
          )}
        </div>
      )}
    </Link>
  )
}

const SL_DAYS = ['Nedelja', 'Ponedeljek', 'Torek', 'Sreda', 'Četrtek', 'Petek', 'Sobota']
// Dnevni podnaslov iz "YYYY-MM-DD" (lokalno, brez TZ zamika): "Sobota, 25. 10. 2025".
function dayHeading(datePart: string): string {
  const [y, m, d] = datePart.split('-').map(Number)
  if (!y || !m || !d) return 'Brez urnika'
  return `${SL_DAYS[new Date(y, m - 1, d).getDay()]}, ${d}. ${m}. ${y}`
}
// Kronološka razvrstitev tekem (prazni termini na konec), nato po skupini.
function sortFixturesChrono(fs: LeagueFixture[]): LeagueFixture[] {
  return [...fs].sort((a, b) => {
    const da = a.scheduled_date ?? '', db = b.scheduled_date ?? ''
    if (da && db && da !== db) return da < db ? -1 : 1
    if (da && !db) return -1
    if (!da && db) return 1
    return (a.group_label ?? '').localeCompare(b.group_label ?? '')
  })
}
// Kolo z datumskimi podnaslovi: tekme grupirane po datumu (kronološko), vsak s podnaslovom dan + datum.
function RoundFixtures({ round, fixtures, myTeamId, showGroup }: { round: number; fixtures: LeagueFixture[]; myTeamId?: string; showGroup?: boolean }) {
  const groups = new Map<string, LeagueFixture[]>()
  for (const f of fixtures) {
    const dp = f.scheduled_date ? String(f.scheduled_date).slice(0, 10) : ''
    if (!groups.has(dp)) groups.set(dp, [])
    groups.get(dp)!.push(f)
  }
  const dateKeys = [...groups.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a < b ? -1 : 1))
  return (
    <div>
      <h3 className="text-sm font-bold text-bocce-green uppercase tracking-wide mb-3">{round}. kolo</h3>
      <div className="space-y-4">
        {dateKeys.map(dk => (
          <div key={dk || 'brez'}>
            <p className="text-sm font-semibold text-gray-700 mb-2 px-1">{dk ? dayHeading(dk) : 'Brez urnika'}</p>
            <div className="space-y-2">
              {sortFixturesChrono(groups.get(dk)!).map(f => (
                <FixtureRow key={f.id} f={f} myTeamId={myTeamId} showGroup={showGroup} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// LEAGUE DETAIL
// ──────────────────────────────────────────────────────────────
export function LeagueDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()

  const [season, setSeason] = useState<LeagueSeason | null>(null)
  const [teams, setTeams] = useState<LeagueTeam[]>([])
  const [fixtures, setFixtures] = useState<LeagueFixture[]>([])
  const [searchParams, setSearchParams] = useSearchParams()
  const TABS = ['standings', 'fixtures', 'teams', 'statistika', 'rang'] as const
  type TabKey = typeof TABS[number]
  const paramTab = searchParams.get('tab')
  const [tab, setTabState] = useState<TabKey>(
    (TABS as readonly string[]).includes(paramTab ?? '') ? (paramTab as TabKey) : 'standings',
  )
  const setTab = (t: TabKey) => { setTabState(t); setSearchParams({ tab: t }, { replace: true }) }
  const [loading, setLoading] = useState(true)
  const [matchResults, setMatchResults] = useState<Array<LeagueMatchResult & { discipline_results?: LeagueMatchDisciplineResult[] }>>([])
  const [disciplines, setDisciplines] = useState<LeagueSeasonDiscipline[]>([])
  const [names, setNames] = useState<Map<string, ResolvedPlayer>>(new Map())

  useEffect(() => { load() }, [id])

  // Real-time: refresh when fixtures change
  useEffect(() => {
    if (!id) return
    const channel = supabase
      .channel(`league-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_fixtures', filter: `season_id=eq.${id}` }, () => { load() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id])

  async function load() {
    if (!id) return
    const [{ data: s }, { data: t }, { data: f }] = await Promise.all([
      supabase.from('league_seasons').select('*').eq('id', id).single(),
      supabase.from('league_teams').select(`*, captain:users(${USER_PUBLIC_COLS}), league_team_players(*, player:users(${USER_PUBLIC_COLS}))`).eq('season_id', id),
      supabase.from('league_fixtures').select(`*, home_team:league_teams!league_fixtures_home_team_id_fkey(*), away_team:league_teams!league_fixtures_away_team_id_fkey(*)`).eq('season_id', id).order('round_number').order('scheduled_date'),
    ])
    setSeason(s as LeagueSeason)
    setTeams((t ?? []) as LeagueTeam[])

    // imena glavnih sodnikov (za pasico) — ločena poizvedba, brez krhkih embedov
    const fixturesRaw = (f ?? []) as LeagueFixture[]
    const cjIds = [...new Set(fixturesRaw.map(fx => fx.chief_judge_id).filter(Boolean))] as string[]
    let cjMap: Record<string, string | null> = {}
    if (cjIds.length) {
      const { data: cj } = await supabase.from('users').select('id, full_name').in('id', cjIds)
      cjMap = Object.fromEntries((cj ?? []).map((u: { id: string; full_name: string | null }) => [u.id, u.full_name]))
    }
    setFixtures(fixturesRaw.map(fx => ({
      ...fx,
      chief_judge: fx.chief_judge_id ? { full_name: cjMap[fx.chief_judge_id] ?? null } : null,
    })))

    const { data: discData } = await supabase.from('league_season_disciplines')
      .select('*').eq('season_id', id).order('order_num')
    setDisciplines((discData ?? []) as LeagueSeasonDiscipline[])

    const { data: mrData } = await supabase.from('league_match_results')
      .select('*, discipline_results:league_match_discipline_results(*)')
      .in('fixture_id', (f ?? []).map((fx: { id: string }) => fx.id))
    const results = (mrData ?? []) as Array<LeagueMatchResult & { discipline_results?: LeagueMatchDisciplineResult[] }>
    setMatchResults(results)

    const ids = results.flatMap(r => (r.discipline_results ?? [])
      .flatMap(dr => [...(dr.home_players ?? []), ...(dr.away_players ?? [])]))
      .filter(p => p && !p.startsWith('R: '))
    setNames(await resolvePlayerNames(ids))

    setLoading(false)
  }

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-bocce-green" /></div>
  if (!season) return <div className="text-center py-12 text-gray-400">Sezona ni najdena</div>

  const standings = calculateStandings(teams, fixtures, season, matchResults)
  const groupStandings = calculateGroupStandings(teams, fixtures, season, matchResults)
  const byRound = getFixturesByRound(fixtures)
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b)

  const myTeam = teams.find(t => t.league_team_players?.some(p => p.player_id === user?.id))

  // For group leagues: separate rounds into phase 1 (A/B) and phase 2 (1-6/7-12)
  const isGroupLeague = groupStandings.hasGroups
  const phase1Rounds = isGroupLeague
    ? rounds.filter(r => byRound[r].some(f => f.group_label === 'A' || f.group_label === 'B'))
    : []
  const phase2Rounds = isGroupLeague
    ? rounds.filter(r => byRound[r].some(f => f.group_label === '1-6' || f.group_label === '7-12'))
    : []

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[season.status]}`}>
              {STATUS_LABELS[season.status]}
            </span>
            <h1 className="text-2xl font-bold text-gray-800 mt-1">{season.name}</h1>
            <p className="text-gray-500 text-sm">Sezona {season.year} · {teams.length} ekip · {season.rounds_count} kol</p>
          </div>
          {myTeam && (
            <div className="bg-bocce-green/5 border border-bocce-green/20 rounded-lg px-4 py-2 text-right">
              <p className="text-xs text-gray-500">Moja ekipa</p>
              <p className="font-semibold text-bocce-green">{myTeam.club_name}</p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {[
          { key: 'standings' as const, label: 'Lestvica' },
          { key: 'fixtures' as const, label: 'Razpored' },
          { key: 'teams' as const, label: `Ekipe (${teams.length})` },
          { key: 'statistika' as const, label: 'Statistika' },
          { key: 'rang' as const, label: 'Rang' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px
              ${tab === t.key ? 'border-bocce-green text-bocce-green' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'standings' && !isGroupLeague && (
        <LeagueTable standings={standings} highlightTeamId={myTeam?.id} />
      )}

      {tab === 'standings' && isGroupLeague && (
        <div className="space-y-8">
          {/* Phase 1 — skupinski del */}
          <div>
            <h2 className="text-base font-bold text-gray-700 mb-1 flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-bocce-green" />
              Faza 1 — Skupinski del
            </h2>
            <p className="text-xs text-gray-400 mb-4">Skupini A in B igrajo vsak s vsakim (5 ekip × 10 kol)</p>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded text-xs font-bold flex items-center justify-center bg-bocce-green/10 text-bocce-green">A</span>
                  Skupina A
                </h3>
                <LeagueTable standings={groupStandings.phase1.A} highlightTeamId={myTeam?.id} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded text-xs font-bold flex items-center justify-center bg-blue-100 text-blue-700">B</span>
                  Skupina B
                </h3>
                <LeagueTable standings={groupStandings.phase1.B} highlightTeamId={myTeam?.id} />
              </div>
            </div>
          </div>

          {/* Phase 2 — nadaljevalni del */}
          {groupStandings.phase2 && (
            <div>
              <h2 className="text-base font-bold text-gray-700 mb-1 flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-bocce-gold" />
                Faza 2 — Nadaljevalni del
              </h2>
              <p className="text-xs text-gray-400 mb-4">
                Vključuje medsebojne rezultate iz faze 1 — vsaka ekipa odigra 6 novih tekem
              </p>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <span className="text-xs font-bold px-1 py-0.5 rounded bg-bocce-gold/20 text-yellow-700">1–6</span>
                    Nadaljevalna 1–6
                  </h3>
                  <LeagueTable standings={groupStandings.phase2['1-6']} highlightTeamId={myTeam?.id} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <span className="text-xs font-bold px-1 py-0.5 rounded bg-gray-100 text-gray-500">7–12</span>
                    Nadaljevalna 7–12
                  </h3>
                  <LeagueTable standings={groupStandings.phase2['7-12']} highlightTeamId={myTeam?.id} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'fixtures' && (
        <div className="space-y-6">
          {rounds.length === 0 ? (
            <div className="text-center py-12 text-gray-400 italic">Ni tekem</div>
          ) : isGroupLeague ? (
            /* ── GROUP LEAGUE FIXTURE VIEW ── */
            <>
              {/* Faza 1 */}
              {phase1Rounds.length > 0 && (
                <div className="space-y-6">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-bocce-green" />
                    <h2 className="text-base font-bold text-gray-700">Faza 1 — Skupinski del</h2>
                    <span className="text-xs text-gray-400">(R1–{phase1Rounds[phase1Rounds.length - 1]})</span>
                  </div>
                  {phase1Rounds.map(round => (
                    <RoundFixtures key={round} round={round} fixtures={byRound[round]} myTeamId={myTeam?.id} showGroup />
                  ))}
                </div>
              )}

              {/* Faza 2 */}
              {phase2Rounds.length > 0 && (
                <div className="space-y-6">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-bocce-gold" />
                    <h2 className="text-base font-bold text-gray-700">Faza 2 — Nadaljevalni del</h2>
                    <span className="text-xs text-gray-400">(R{phase2Rounds[0]}–{phase2Rounds[phase2Rounds.length - 1]})</span>
                  </div>
                  {phase2Rounds.map(round => (
                    <RoundFixtures key={round} round={round} fixtures={byRound[round]} myTeamId={myTeam?.id} showGroup />
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Regular rounds */}
              {rounds.filter(r => r <= season.rounds_count).map(round => (
                <RoundFixtures key={round} round={round} fixtures={byRound[round]} myTeamId={myTeam?.id} />
              ))}

              {/* Playoff (končnica) */}
              {(() => {
                const playoffRounds = rounds.filter(r => r > season.rounds_count)
                if (playoffRounds.length === 0) return null

                // Rounds with >1 fixture = semifinal; rounds with 1 fixture = final
                const semiRounds = playoffRounds.filter(r => byRound[r].length > 1)
                const finalRounds = playoffRounds.filter(r => byRound[r].length === 1)

                const renderPlayoffRound = (round: number, gameIdx: number) => {
                  const gameLabel = gameIdx === 0 ? '1. tekma' : gameIdx === 1 ? '2. tekma' : 'Odločilna tekma'
                  return (
                    <div key={round}>
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{gameLabel}</h3>
                      <div className="space-y-2">
                        {byRound[round].map(f => {
                          const notPlayed = f.status !== 'completed' && !f.scheduled_date
                          if (notPlayed) {
                            return (
                              <div key={f.id}
                                className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-3 flex items-center gap-4 opacity-50">
                                <div className="flex-1 text-right">
                                  <span className="font-medium text-sm text-gray-500">{f.home_team?.club_name}</span>
                                </div>
                                <div className="text-center min-w-[80px]">
                                  <span className="text-xs text-gray-400 italic">ni bila odigrana</span>
                                </div>
                                <div className="flex-1 text-left">
                                  <span className="font-medium text-sm text-gray-500">{f.away_team?.club_name}</span>
                                </div>
                              </div>
                            )
                          }
                          return <FixtureRow key={f.id} f={f} myTeamId={myTeam?.id} />
                        })}
                      </div>
                    </div>
                  )
                }

                return (
                  <div className="space-y-8">
                    {semiRounds.length > 0 && (
                      <div>
                        <h2 className="text-base font-bold text-gray-700 mb-4 flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded-full bg-bocce-gold" />
                          Polfinale
                        </h2>
                        <div className="space-y-4">
                          {semiRounds.map((round, idx) => renderPlayoffRound(round, idx))}
                        </div>
                      </div>
                    )}

                    {finalRounds.length > 0 && (
                      <div>
                        <h2 className="text-base font-bold text-gray-700 mb-4 flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded-full bg-bocce-gold" />
                          Finale
                        </h2>
                        <div className="space-y-4">
                          {finalRounds.map((round, idx) => renderPlayoffRound(round, idx))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </>
          )}
        </div>
      )}

      {tab === 'teams' && (
        <div className="grid sm:grid-cols-2 gap-4">
          {teams.map(team => (
            <div key={team.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="font-semibold text-gray-800 mb-2">{team.club_name}</h3>
              {team.captain && (
                <p className="text-xs text-gray-500 mb-2">Kapitan: {team.captain.full_name}</p>
              )}
              {team.league_team_players && team.league_team_players.length > 0 && (
                <div className="space-y-1">
                  {team.league_team_players.map(p => (
                    <div key={p.id} className="text-sm text-gray-700 flex items-center gap-2">
                      {p.jersey_number && <span className="text-xs text-gray-400 w-5">#{p.jersey_number}</span>}
                      {p.player?.full_name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'statistika' && season && (
        <LeagueStatsPanel fixtures={fixtures} matchResults={matchResults}
          disciplines={disciplines} teams={teams} names={names} />
      )}

      {tab === 'rang' && season && (
        <LeagueRangPanel fixtures={fixtures} matchResults={matchResults}
          disciplines={disciplines} teams={teams} names={names} tier={season.tier} />
      )}
    </div>
  )
}
