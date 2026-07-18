import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { USER_PUBLIC_COLS } from '../lib/userColumns'
import { loadTournamentPlayers } from '../lib/tournamentPlayers'
import { useAuth } from '../contexts/AuthContext'
import GroupBracket from '../components/GroupBracket'
import KnockoutBracket from '../components/KnockoutBracket'
import RoundRobinStandings from '../components/RoundRobinStandings'
import ScoreModal from '../components/ScoreModal'
import { format } from 'date-fns'
import { sl as dateSl } from 'date-fns/locale'
import { GROUP_TEMPLATES, computePropagation } from '../engines/tournament'
import { propagateKnockout } from '../lib/knockoutDraw'
import type {
  Tournament, TournamentGroup, Match, TournamentRegistration,
  TournamentStatus, TournamentCategory, TournamentKind, UserProfile, GroupSize,
} from '../types'

const CATEGORY_LABELS: Record<TournamentCategory, string> = {
  men: 'Moški', women: 'Ženske', u18: 'U18', mixed: 'Mešano',
  u18_women: 'U18 Ženske', u15: 'U15', u12: 'U12',
}
const STATUS_LABELS: Record<TournamentStatus, string> = {
  draft: 'Osnutek', registration_open: 'Prijave odprte', in_progress: 'V teku', completed: 'Zaključen',
}
const STATUS_COLORS: Record<TournamentStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  registration_open: 'bg-green-100 text-green-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-blue-100 text-blue-700',
}

type PlayerOption = Pick<UserProfile, 'id' | 'full_name' | 'club'>

// ──────────────────────────────────────────────────────────────
// TOURNAMENT LIST
// ──────────────────────────────────────────────────────────────
function TournamentCard({ t, basePath }: { t: Tournament; basePath: string }) {
  return (
    <Link to={`${basePath}/${t.id}`}
      className="block bg-white border border-gray-200 rounded-xl p-5 hover:border-bocce-green hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-semibold text-gray-800">{t.name}</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
              {CATEGORY_LABELS[t.category]}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {format(new Date(t.date), 'd. MMMM yyyy', { locale: dateSl })} · {t.location}
          </p>
          {t.registration_deadline && t.status === 'registration_open' && (
            <p className="text-xs text-orange-500 mt-1">
              Rok za prijavo: {format(new Date(t.registration_deadline), 'd. M. yyyy')}
            </p>
          )}
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${STATUS_COLORS[t.status]}`}>
          {STATUS_LABELS[t.status]}
        </span>
      </div>
    </Link>
  )
}

const CAT_ORDER: TournamentCategory[] = ['men', 'women', 'u18', 'u18_women', 'mixed', 'u15', 'u12']

export function TournamentList({ kind = 'tournament' }: { kind?: TournamentKind }) {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [filter, setFilter] = useState<TournamentStatus | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [closedCats, setClosedCats] = useState<Set<string>>(new Set())

  useEffect(() => {
    supabase.from('tournaments').select('*').eq('kind', kind).order('date', { ascending: false })
      .then(({ data }) => { setTournaments((data ?? []) as Tournament[]); setLoading(false) })
  }, [kind])

  const statuses: Array<TournamentStatus | 'all'> = ['all', 'registration_open', 'in_progress', 'completed']
  const filtered = filter === 'all' ? tournaments : tournaments.filter(t => t.status === filter)
  const isChamp = kind === 'championship'
  const title = isChamp ? 'Državna prvenstva' : 'Turnirji'
  const basePath = isChamp ? '/prvenstva' : '/turnirji'

  // Prvenstva: skupine po kategorijah → letih
  const yearOf = (d: string) => parseInt(String(d).slice(0, 4), 10)
  const catsPresent = CAT_ORDER.filter(c => filtered.some(t => t.category === c))
  const extraCats = [...new Set(filtered.map(t => t.category))].filter(c => !CAT_ORDER.includes(c as TournamentCategory)) as TournamentCategory[]
  const orderedCats = [...catsPresent, ...extraCats]
  const toggleCat = (c: string) =>
    setClosedCats(s => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n })

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">{title}</h1>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {statuses.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors
              ${filter === s ? 'bg-bocce-green text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {s === 'all' ? 'Vsi' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 italic">Ni {isChamp ? 'prvenstev' : 'turnirjev'}</div>
      ) : !isChamp ? (
        <div className="space-y-3">
          {filtered.map(t => <TournamentCard key={t.id} t={t} basePath={basePath} />)}
        </div>
      ) : (
        <div className="space-y-3">
          {orderedCats.map(cat => {
            const inCat = filtered.filter(t => t.category === cat)
            const years = [...new Set(inCat.map(t => yearOf(t.date)))].sort((a, b) => b - a)
            const open = !closedCats.has(cat)
            return (
              <div key={cat} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                <button onClick={() => toggleCat(cat)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <span className="flex items-center gap-2.5">
                    <span className="font-semibold text-gray-800">{CATEGORY_LABELS[cat] ?? cat}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{inCat.length}</span>
                  </span>
                  <span className={`text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
                </button>
                {open && (
                  <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-3">
                    {years.map(y => (
                      <div key={y}>
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">{y}</h3>
                        <div className="space-y-2">
                          {inCat.filter(t => yearOf(t.date) === y).map(t => (
                            <TournamentCard key={t.id} t={t} basePath={basePath} />
                          ))}
                        </div>
                      </div>
                    ))}
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
// TOURNAMENT DETAIL
// ──────────────────────────────────────────────────────────────
export function TournamentDetail() {
  const { id } = useParams<{ id: string }>()
  const { user, isAdmin } = useAuth()

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [groups, setGroups] = useState<TournamentGroup[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [registrations, setRegistrations] = useState<TournamentRegistration[]>([])
  const [myReg, setMyReg] = useState<TournamentRegistration | null>(null)
  const [tab, setTab] = useState<'groups' | 'knockout' | 'registrations' | 'standings'>('groups')
  const [scoreMatch, setScoreMatch] = useState<Match | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [regForm, setRegForm] = useState({ partner: '' })
  const [players, setPlayers] = useState<PlayerOption[]>([])
  const [regLoading, setRegLoading] = useState(false)
  const [regError, setRegError] = useState('')

  useEffect(() => { load() }, [id])

  useEffect(() => {
    if (tournament?.format === 'knockout') setTab('knockout')
    else if (tournament?.format === 'round_robin') setTab('standings')
  }, [tournament?.format])

  // Real-time subscription for match updates
  useEffect(() => {
    if (!id) return
    const channel = supabase
      .channel(`tournament-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${id}` }, () => { load() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id])

  async function load() {
    if (!id) return
    try {
      const [{ data: t, error: tErr }, { data: g }, { data: m }, { data: r }] = await Promise.all([
        supabase.from('tournaments').select('*').eq('id', id).single(),
        supabase.from('tournament_groups').select('*').eq('tournament_id', id).order('group_number'),
        supabase.from('matches').select(`*, team_a:group_teams!matches_team_a_id_fkey(*, registration:tournament_registrations(*, player1:users!tournament_registrations_player1_id_fkey(${USER_PUBLIC_COLS}), player2:users!tournament_registrations_player2_id_fkey(${USER_PUBLIC_COLS}), guest1:guest_players!tournament_registrations_player1_guest_id_fkey(*), guest2:guest_players!tournament_registrations_player2_guest_id_fkey(*))), team_b:group_teams!matches_team_b_id_fkey(*, registration:tournament_registrations(*, player1:users!tournament_registrations_player1_id_fkey(${USER_PUBLIC_COLS}), player2:users!tournament_registrations_player2_id_fkey(${USER_PUBLIC_COLS}), guest1:guest_players!tournament_registrations_player1_guest_id_fkey(*), guest2:guest_players!tournament_registrations_player2_guest_id_fkey(*)))`).eq('tournament_id', id),
        supabase.from('tournament_registrations').select(`*, player1:users!tournament_registrations_player1_id_fkey(${USER_PUBLIC_COLS}), player2:users!tournament_registrations_player2_id_fkey(${USER_PUBLIC_COLS}), guest1:guest_players!tournament_registrations_player1_guest_id_fkey(*), guest2:guest_players!tournament_registrations_player2_guest_id_fkey(*)`).eq('tournament_id', id),
      ])
      if (tErr) throw tErr
      setTournament(t as Tournament)
      setGroups((g ?? []) as TournamentGroup[])
      setMatches((m ?? []) as Match[])
      const regs = (r ?? []) as TournamentRegistration[]
      setRegistrations(regs)
      if (user) {
        const mine = regs.find(x => x.player1_id === user.id || x.player2_id === user.id)
        setMyReg(mine ?? null)
      }
    } catch (e) {
      setLoadError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function loadPlayers() {
    // Vključi tudi igralce-sodnike/admine, ki so v ligaških postavah.
    const all = await loadTournamentPlayers('id, full_name, club')
    setPlayers(all as PlayerOption[])
  }

  async function handleRegister() {
    setRegError('')
    if (!regForm.partner) { setRegError('Izberi partnerja'); return }
    const partnerTaken = registrations.some(
      r => r.player1_id === regForm.partner || r.player2_id === regForm.partner
    )
    if (partnerTaken) { setRegError('Ta igralec je že prijavljen na ta turnir'); return }
    setRegLoading(true)
    try {
      const { error } = await supabase.from('tournament_registrations').insert({
        tournament_id: id,
        player1_id: user!.id,
        player2_id: regForm.partner,
        status: 'pending',
      })
      if (error) throw error
      await load()
    } catch (e) {
      setRegError((e as Error).message)
    }
    setRegLoading(false)
  }

  async function handleSaveScore(match: Match, scoreA: number, scoreB: number) {
    const winnerId = scoreA > scoreB ? match.team_a_id : match.team_b_id
    const loserId  = scoreA > scoreB ? match.team_b_id : match.team_a_id

    const { error } = await supabase.from('matches').update({
      score_a: scoreA, score_b: scoreB, winner_id: winnerId, status: 'completed', played_at: new Date().toISOString(),
    }).eq('id', match.id)
    if (error) throw error

    if (match.group_id) {
      await propagateGroup(match.group_id)
    } else if (tournament?.format === 'knockout' && match.stage !== 'group') {
      await propagateKnockout(match.tournament_id)
    }

    await load()
  }

  async function propagateGroup(groupId: string) {
    const { data: fresh } = await supabase
      .from('matches')
      .select('id, match_number, status, is_bye, team_a_id, team_b_id, winner_id')
      .eq('group_id', groupId)
    if (!fresh) return

    const group = groups.find(g => g.id === groupId)
    const groupSize = ((group?.group_size ?? 4) as GroupSize)
    const template = GROUP_TEMPLATES[groupSize]

    // Iterate until no more changes (handles chains: T1→T6→T7).
    // Hard cap as a backstop — the longest template (5 teams) has only 9
    // matches, so a real chain never comes close to 20 passes.
    const MAX_PASSES = 20
    let changed = true
    let pass = 0
    while (changed) {
      if (pass >= MAX_PASSES) {
        console.warn(`propagateGroup: hit iteration cap (${MAX_PASSES}) for group ${groupId}`)
        break
      }
      pass++
      changed = false

      const propagationUpdates = computePropagation(fresh, template)
      for (const { match_number, updates } of propagationUpdates) {
        const dep = fresh.find(m => m.match_number === match_number)
        if (!dep) continue
        const { error } = await supabase.from('matches').update(updates).eq('id', dep.id)
        if (error) throw error
        Object.assign(dep, updates)  // update local copy for next iteration
        changed = true
      }
    }
  }

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-bocce-green" /></div>
  if (loadError) return <div className="text-center py-12 text-red-500">Napaka pri nalaganju: {loadError}</div>
  if (!tournament) return <div className="text-center py-12 text-gray-400">Turnir ni najden</div>

  const groupMatches = matches.filter(m => m.stage === 'group')
  const knockoutMatches = matches.filter(m => m.stage !== 'group')
  const confirmedRegs = registrations.filter(r => r.status === 'confirmed')

  const backPath = tournament.kind === 'championship' ? '/prvenstva' : '/turnirji'
  const backLabel = tournament.kind === 'championship' ? '← Državna prvenstva' : '← Turnirji'

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link to={backPath} className="inline-block text-sm text-bocce-green hover:underline mb-4">{backLabel}</Link>
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[tournament.status]}`}>
                {STATUS_LABELS[tournament.status]}
              </span>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {CATEGORY_LABELS[tournament.category]}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-gray-800">{tournament.name}</h1>
            <p className="text-gray-500 mt-1">
              {format(new Date(tournament.date), 'd. MMMM yyyy', { locale: dateSl })} · {tournament.location}
            </p>
            {tournament.notes && <p className="text-sm text-gray-500 mt-2">{tournament.notes}</p>}
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-bocce-green">{confirmedRegs.length}</div>
            <div className="text-sm text-gray-500">prijavljenih parov</div>
          </div>
        </div>
      </div>

      {/* Registration for players */}
      {tournament.status === 'registration_open' && user && !myReg && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-6">
          <h2 className="font-semibold text-green-800 mb-3">Prijavi se na turnir</h2>
          <div className="flex gap-3 flex-wrap">
            <select
              value={regForm.partner}
              onChange={e => setRegForm({ partner: e.target.value })}
              onFocus={loadPlayers}
              className="flex-1 min-w-0 border border-green-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none"
            >
              <option value="">Izberi partnerja...</option>
              {players.filter(p => p.id !== user.id).map(p => (
                <option key={p.id} value={p.id}>{p.full_name}{p.club ? ` (${p.club})` : ''}</option>
              ))}
            </select>
            <button onClick={handleRegister} disabled={regLoading}
              className="bg-bocce-green text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-bocce-green-light transition-colors disabled:opacity-50">
              {regLoading ? 'Prijavljam...' : 'Prijavi se'}
            </button>
          </div>
          {regError && <p className="text-red-600 text-sm mt-2">{regError}</p>}
        </div>
      )}

      {myReg && tournament.status === 'registration_open' && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <span className="text-blue-600">✓</span>
          <div>
            <p className="text-sm font-medium text-blue-800">
              Prijavljen si skupaj z {myReg.player1_id === user?.id ? myReg.player2?.full_name : myReg.player1?.full_name}
            </p>
            <p className="text-xs text-blue-600">
              Status: {myReg.status === 'pending' ? 'Čaka na potrditev' : myReg.status === 'confirmed' ? 'Potrjena' : 'Zavrnjena'}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(tournament.format === 'knockout'
          ? [
              { key: 'knockout' as const, label: 'Izločilni del' },
              { key: 'registrations' as const, label: `Prijave (${registrations.length})` },
            ]
          : tournament.format === 'round_robin'
          ? [
              { key: 'standings' as const, label: 'Lestvica' },
              { key: 'registrations' as const, label: `Prijave (${registrations.length})` },
            ]
          : [
              { key: 'groups' as const, label: `Skupine (${groups.length})` },
              { key: 'knockout' as const, label: 'Izločilni del' },
              { key: 'registrations' as const, label: `Prijave (${registrations.length})` },
            ]
        ).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px
              ${tab === t.key ? 'border-bocce-green text-bocce-green' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'groups' && (
        <div className="grid sm:grid-cols-2 gap-4">
          {groups.length === 0 ? (
            <div className="col-span-2 text-center py-12 text-gray-400 italic">Žreb skupin še ni opravljen</div>
          ) : (
            groups.map(g => (
              <GroupBracket
                key={g.id}
                group={g}
                matches={groupMatches.filter(m => m.group_id === g.id)}
                registrations={registrations}
                isAdmin={isAdmin}
                onEnterScore={setScoreMatch}
              />
            ))
          )}
        </div>
      )}

      {tab === 'knockout' && (
        <KnockoutBracket
          matches={knockoutMatches}
          registrations={registrations}
          isAdmin={isAdmin}
          onEnterScore={setScoreMatch}
        />
      )}

      {tab === 'standings' && (
        <RoundRobinStandings
          matches={groupMatches}
          registrations={registrations}
          isAdmin={isAdmin}
          onEnterScore={setScoreMatch}
        />
      )}

      {tab === 'registrations' && (
        <div className="space-y-2">
          {registrations.length === 0 ? (
            <div className="text-center py-12 text-gray-400 italic">Ni prijav</div>
          ) : (
            registrations.map((r, i) => (
              <div key={r.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 text-sm w-6">{i + 1}.</span>
                  <div>
                    <span className="font-medium text-gray-800">
                      {r.player1?.full_name ?? r.guest1?.full_name ?? r.player1_name}{(r.player2_id || r.player2 || r.player2_guest_id || r.guest2 || r.player2_name) ? ` / ${r.player2?.full_name ?? r.guest2?.full_name ?? r.player2_name}` : ''}
                    </span>
                    {(r.player1?.club || r.player2?.club) && (
                      <p className="text-xs text-gray-500">{r.player1?.club ?? r.player2?.club}</p>
                    )}
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                  ${r.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                    r.status === 'rejected' ? 'bg-red-100 text-red-600' :
                    'bg-yellow-100 text-yellow-700'}`}>
                  {r.status === 'confirmed' ? 'Potrjena' : r.status === 'rejected' ? 'Zavrnjena' : 'Čaka'}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {scoreMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <ScoreModal
            match={scoreMatch}
            onSave={handleSaveScore}
            onClose={() => setScoreMatch(null)}
          />
        </div>
      )}
    </div>
  )
}
