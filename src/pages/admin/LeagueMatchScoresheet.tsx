import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../supabase'
import { useAuth } from '../../contexts/AuthContext'
import { BLOCK_LABELS } from '../../engines/leagueDisciplines'
import { getAutoPlayground, getBlok4Playground, BLOK4_DISCIPLINES } from '../../engines/leaguePlaygrounds'
import type { LeagueFixture, LeagueSeasonDiscipline, LeagueMatchResult, LeagueMatchDisciplineResult, DisciplineType, UserProfile } from '../../types'
import { evaluatePlayerLineup, seasonUsesBlock2Rule, type LineupDisc } from '../../engines/leagueLineup'

const TECHNICAL_TYPES: DisciplineType[] = ['stafeta', 'hitrostno', 'natancno']

interface DisciplineForm {
  homePlayers: string[]
  awayPlayers: string[]
  homeReserve: string
  awayReserve: string
  homeScore: string
  awayScore: string
}

interface RosterPlayer { playerId: string; name: string }

interface PlayerStats {
  count: number
  techTypes: Set<DisciplineType>
  hasAllTechTypes: boolean
  discs: LineupDisc[]
}

const EMPTY_STATS: PlayerStats = { count: 0, techTypes: new Set(), hasAllTechTypes: false, discs: [] }

/**
 * Učinkovita ocena igralca: pri ženski 1. ligi (useRule) velja pravilo bloka 2
 * (max 4 le ob Hitrostno+Štafeta, sicer max 3; v bloku 2 le ta par); sicer staro
 * pravilo (max 3, ne vse 3 tehnične discipline).
 */
function evalPlayer(s: PlayerStats, useRule: boolean) {
  if (useRule) {
    const e = evaluatePlayerLineup(s.discs)
    return { maxAllowed: e.maxAllowed, atMax: s.count >= e.maxAllowed, countViolation: e.countViolation, anyViolation: !e.ok }
  }
  return { maxAllowed: 3, atMax: s.count >= 3, countViolation: s.count > 3, anyViolation: s.hasAllTechTypes || s.count > 3 }
}

function calcPoints(h: string, a: string): [0 | 1 | 2, 0 | 1 | 2] | null {
  if (!h || !a) return null
  const hn = Number(h), an = Number(a)
  if (hn > an) return [2, 0]
  if (an > hn) return [0, 2]
  return [1, 1]   // izenačeno — vsaka ekipa dobi 1 točko
}

function emptyForm(n: number): DisciplineForm {
  return { homePlayers: Array(n).fill(''), awayPlayers: Array(n).fill(''), homeReserve: '', awayReserve: '', homeScore: '', awayScore: '' }
}

function computeStats(disciplines: LeagueSeasonDiscipline[], forms: Record<string, DisciplineForm>, side: 'home' | 'away'): Record<string, PlayerStats> {
  const stats: Record<string, PlayerStats> = {}
  function add(name: string, disc: LeagueSeasonDiscipline) {
    if (!name.trim()) return
    if (!stats[name]) stats[name] = { count: 0, techTypes: new Set(), hasAllTechTypes: false, discs: [] }
    stats[name].count++
    stats[name].discs.push({ discipline_type: disc.discipline_type, block_number: disc.block_number ?? null })
    if (TECHNICAL_TYPES.includes(disc.discipline_type as DisciplineType)) {
      stats[name].techTypes.add(disc.discipline_type as DisciplineType)
    }
  }
  for (const disc of disciplines) {
    const f = forms[disc.id]; if (!f) continue
    const players = side === 'home' ? f.homePlayers : f.awayPlayers
    const reserve = side === 'home' ? f.homeReserve : f.awayReserve
    for (const p of [...players, reserve]) { if (p) add(p, disc) }
  }
  for (const s of Object.values(stats)) {
    s.hasAllTechTypes = TECHNICAL_TYPES.every(t => s.techTypes.has(t))
  }
  return stats
}

// Player select — shows team roster as dropdown options with constraint info
function PlayerSelect({ value, onChange, roster, stats, currentDiscType, isTechnical, useBlock2Rule }: {
  value: string
  onChange: (v: string) => void
  roster: RosterPlayer[]
  stats: Record<string, PlayerStats>
  currentDiscType: DisciplineType
  isTechnical: boolean
  useBlock2Rule: boolean
}) {
  if (roster.length === 0) {
    return (
      <input value={value} onChange={e => onChange(e.target.value)}
        className="block w-full border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-bocce-green outline-none"
        placeholder="Ime Priimek" />
    )
  }

  function wouldViolateTech(playerId: string): boolean {
    if (!isTechnical) return false
    const s = stats[playerId]
    if (!s) return false
    const typesWithThis = new Set(s.techTypes)
    typesWithThis.add(currentDiscType)
    return TECHNICAL_TYPES.every(t => typesWithThis.has(t))
  }

  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className={`block w-full border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-bocce-green outline-none bg-white ${
        value ? 'border-gray-300' : 'border-gray-200 text-gray-400'}`}>
      <option value="">— izberi —</option>
      {roster.map(p => {
        const s = stats[p.playerId] || EMPTY_STATS
        const e = evalPlayer(s, useBlock2Rule)
        const atMax = e.atMax && value !== p.playerId
        const techWarn = !useBlock2Rule && wouldViolateTech(p.playerId) && value !== p.playerId
        return (
          <option key={p.playerId} value={p.playerId} disabled={atMax}>
            {p.name}{s.count > 0 ? ` (${s.count}/${e.maxAllowed})` : ''}{techWarn ? ' ⚠' : ''}{atMax ? ' — max' : ''}
          </option>
        )
      })}
    </select>
  )
}

export default function LeagueMatchScoresheet() {
  const { fixtureId } = useParams<{ fixtureId: string }>()
  const { user, isAdmin } = useAuth()

  const [fixture, setFixture] = useState<LeagueFixture | null>(null)
  const [disciplines, setDisciplines] = useState<LeagueSeasonDiscipline[]>([])
  const [forms, setForms] = useState<Record<string, DisciplineForm>>({})
  const [homeRoster, setHomeRoster] = useState<RosterPlayer[]>([])
  const [awayRoster, setAwayRoster] = useState<RosterPlayer[]>([])
  const [rosterOpen, setRosterOpen] = useState(true)
  const [drawNatancno, setDrawNatancno] = useState<1 | 4 | null>(null)
  const [drawBlok4, setDrawBlok4] = useState<Record<string, number>>({})
  const [existingResultId, setExistingResultId] = useState<string | null>(null)
  // Judge delegation (stored on fixture)
  const [chiefJudgeUserId, setChiefJudgeUserId] = useState<string>('')
  const [judgeUserIds, setJudgeUserIds] = useState<string[]>([])
  const [allUsers, setAllUsers] = useState<Pick<UserProfile, 'id' | 'full_name'>[]>([])
  const [matchDate, setMatchDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (fixtureId) load() }, [fixtureId])

  async function load() {
    if (!fixtureId) return
    const [{ data: fx }, { data: existing }, { data: usersData }] = await Promise.all([
      supabase.from('league_fixtures')
        .select('*, home_team:league_teams!league_fixtures_home_team_id_fkey(*, league_team_players(*, player:users(*))), away_team:league_teams!league_fixtures_away_team_id_fkey(*, league_team_players(*, player:users(*)))')
        .eq('id', fixtureId).single(),
      supabase.from('league_match_results')
        .select('*, discipline_results:league_match_discipline_results(*)')
        .eq('fixture_id', fixtureId).maybeSingle(),
      supabase.from('users').select('id, full_name').in('role', ['judge', 'admin', 'super_admin']).order('full_name'),
    ])
    setAllUsers((usersData ?? []) as Pick<UserProfile, 'id' | 'full_name'>[])
    if (!fx) { setLoading(false); return }
    const f = fx as LeagueFixture & { home_team: { league_team_players?: Array<{ player: { id: string; full_name: string | null } }> }; away_team: { league_team_players?: Array<{ player: { id: string; full_name: string | null } }> } }
    setFixture(fx as LeagueFixture)
    setMatchDate((fx as LeagueFixture).scheduled_date ?? '')
    setChiefJudgeUserId((fx as LeagueFixture).chief_judge_id ?? '')
    setJudgeUserIds((fx as LeagueFixture).judge_ids ?? [])

    // Build rosters
    const toRoster = (players?: Array<{ player: { id: string; full_name: string | null } }>): RosterPlayer[] =>
      (players ?? []).filter(p => p.player?.full_name).map(p => ({ playerId: p.player.id, name: p.player.full_name! }))
    setHomeRoster(toRoster(f.home_team?.league_team_players))
    setAwayRoster(toRoster(f.away_team?.league_team_players))

    const { data: discs } = await supabase
      .from('league_season_disciplines').select('*')
      .eq('season_id', (fx as LeagueFixture & { season_id: string }).season_id).order('order_num')
    const discList = (discs ?? []) as LeagueSeasonDiscipline[]
    setDisciplines(discList)

    const initForms: Record<string, DisciplineForm> = {}
    if (existing) {
      const res = existing as LeagueMatchResult
      setExistingResultId(res.id)
      if (res.draw_natancno_field) setDrawNatancno(res.draw_natancno_field)
      if (res.draw_blok4) setDrawBlok4(res.draw_blok4)
      for (const disc of discList) {
        const dr = (res.discipline_results ?? []).find(r => r.discipline_id === disc.id) as LeagueMatchDisciplineResult | undefined
        if (dr) {
          const hp = (dr.home_players as string[]) ?? []
          const ap = (dr.away_players as string[]) ?? []
          initForms[disc.id] = {
            homeScore: dr.home_score != null ? String(dr.home_score) : '',
            awayScore: dr.away_score != null ? String(dr.away_score) : '',
            homePlayers: hp.filter(p => !p.startsWith('R: ')).concat(Array(Math.max(0, disc.players_per_side - hp.filter(p => !p.startsWith('R: ')).length)).fill('')),
            awayPlayers: ap.filter(p => !p.startsWith('R: ')).concat(Array(Math.max(0, disc.players_per_side - ap.filter(p => !p.startsWith('R: ')).length)).fill('')),
            homeReserve: hp.find(p => p.startsWith('R: '))?.replace('R: ', '') ?? '',
            awayReserve: ap.find(p => p.startsWith('R: '))?.replace('R: ', '') ?? '',
          }
        } else { initForms[disc.id] = emptyForm(disc.players_per_side) }
      }
    } else {
      for (const disc of discList) initForms[disc.id] = emptyForm(disc.players_per_side)
    }
    setForms(initForms)
    setLoading(false)
  }

  function setFormField(id: string, field: keyof DisciplineForm, value: string) {
    setForms(f => ({ ...f, [id]: { ...f[id], [field]: value } }))
  }
  function setPlayer(id: string, side: 'home' | 'away', idx: number, value: string) {
    setForms(f => {
      const arr = [...(side === 'home' ? f[id].homePlayers : f[id].awayPlayers)]
      arr[idx] = value
      return { ...f, [id]: { ...f[id], [side === 'home' ? 'homePlayers' : 'awayPlayers']: arr } }
    })
  }
  function setBlok4Field(discName: string, field: number) {
    setDrawBlok4(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(k => { if (next[k] === field) delete next[k] })
      next[discName] = field
      return next
    })
  }

  async function assignChiefJudge(userId: string) {
    if (!fixtureId) return
    setChiefJudgeUserId(userId)
    await supabase.from('league_fixtures').update({ chief_judge_id: userId || null }).eq('id', fixtureId)
  }

  async function addJudgeUser(userId: string) {
    if (!fixtureId || !userId || judgeUserIds.includes(userId)) return
    const next = [...judgeUserIds, userId]
    setJudgeUserIds(next)
    await supabase.from('league_fixtures').update({ judge_ids: next }).eq('id', fixtureId)
  }

  async function removeJudgeUser(userId: string) {
    if (!fixtureId) return
    const next = judgeUserIds.filter(id => id !== userId)
    setJudgeUserIds(next)
    await supabase.from('league_fixtures').update({ judge_ids: next }).eq('id', fixtureId)
  }

  const canEdit = isAdmin || (!!user && chiefJudgeUserId === user.id)

  const homeStats = useMemo(() => computeStats(disciplines, forms, 'home'), [disciplines, forms])
  const awayStats = useMemo(() => computeStats(disciplines, forms, 'away'), [disciplines, forms])
  const useBlock2Rule = useMemo(
    () => seasonUsesBlock2Rule(disciplines.map(d => ({ discipline_type: d.discipline_type, block_number: d.block_number ?? null }))),
    [disciplines],
  )

  // Validation errors
  const violations = useMemo(() => {
    const errs: string[] = []
    const resolveName = (id: string, roster: RosterPlayer[]) =>
      roster.find(p => p.playerId === id)?.name ?? id
    const check = (stats: Record<string, PlayerStats>, roster: RosterPlayer[], suff: string) => {
      for (const [id, s] of Object.entries(stats)) {
        const name = resolveName(id, roster)
        const e = evalPlayer(s, useBlock2Rule)
        if (e.countViolation) errs.push(`${name} (${suff}): nastopa v ${s.count} disciplinah (max ${e.maxAllowed})`)
        if (!useBlock2Rule && s.hasAllTechTypes) errs.push(`${name} (${suff}): nastopa v vseh 3 tehničnih disciplinah`)
      }
    }
    check(homeStats, homeRoster, 'dom.')
    check(awayStats, awayRoster, 'gost.')
    return errs
  }, [homeStats, awayStats, homeRoster, awayRoster, useBlock2Rule])

  async function save() {
    if (!fixtureId) return
    setSaving(true); setMessage('')
    let resultId = existingResultId
    const resultData = {
      fixture_id: fixtureId,
      draw_natancno_field: drawNatancno, draw_blok4: Object.keys(drawBlok4).length ? drawBlok4 : null,
    }
    if (!resultId) {
      const { data, error } = await supabase.from('league_match_results').insert(resultData).select().single()
      if (error) { setMessage(`❌ ${error.message}`); setSaving(false); return }
      resultId = (data as LeagueMatchResult).id; setExistingResultId(resultId)
    } else {
      await supabase.from('league_match_results').update(resultData).eq('id', resultId)
    }
    await supabase.from('league_match_discipline_results').delete().eq('match_result_id', resultId)
    let homeTotal = 0, awayTotal = 0, homePunt = 0, awayPunt = 0
    const inserts = disciplines.map(disc => {
      const f = forms[disc.id]; if (!f) return null
      const pts = calcPoints(f.homeScore, f.awayScore)
      if (pts) { homeTotal += pts[0]; awayTotal += pts[1] }
      if (f.homeScore) homePunt += Number(f.homeScore)
      if (f.awayScore) awayPunt += Number(f.awayScore)
      const playground = BLOK4_DISCIPLINES.includes(disc.name)
        ? getBlok4Playground(disc.name, drawBlok4) : getAutoPlayground(disc.name, drawNatancno)
      const homePlayers = f.homePlayers.filter(Boolean)
      if (disc.has_reserve && f.homeReserve) homePlayers.push(`R: ${f.homeReserve}`)
      const awayPlayers = f.awayPlayers.filter(Boolean)
      if (disc.has_reserve && f.awayReserve) awayPlayers.push(`R: ${f.awayReserve}`)
      return {
        match_result_id: resultId, discipline_id: disc.id,
        playground_number: playground ? Number(playground.split(' ')[0]) || null : null,
        home_score: f.homeScore ? Number(f.homeScore) : null,
        away_score: f.awayScore ? Number(f.awayScore) : null,
        home_match_points: pts ? pts[0] : null, away_match_points: pts ? pts[1] : null,
        home_players: homePlayers, away_players: awayPlayers,
      }
    }).filter(Boolean)
    if (inserts.length) {
      const { error } = await supabase.from('league_match_discipline_results').insert(inserts)
      if (error) { setMessage(`❌ ${error.message}`); setSaving(false); return }
    }
    await supabase.from('league_fixtures').update({
      home_score: homeTotal, away_score: awayTotal, status: 'completed',
      scheduled_date: matchDate || null,
    }).eq('id', fixtureId)
    setMessage(`✓ Zapisnik shranjen — Točke: ${homeTotal}:${awayTotal} · Punte: ${homePunt}:${awayPunt}`)
    setSaving(false)
  }

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-bocce-green" /></div>
  if (!fixture) return <div className="text-center py-12 text-gray-400">Tekma ni najdena</div>

  let runHome = 0, runAway = 0, runHomePunt = 0, runAwayPunt = 0
  for (const disc of disciplines) {
    const f = forms[disc.id]; if (!f) continue
    const pts = calcPoints(f.homeScore, f.awayScore)
    if (pts) { runHome += pts[0]; runAway += pts[1] }
    if (f.homeScore) runHomePunt += Number(f.homeScore)
    if (f.awayScore) runAwayPunt += Number(f.awayScore)
  }

  const blocks = disciplines.reduce<Record<number, LeagueSeasonDiscipline[]>>((acc, d) => {
    const b = d.block_number ?? 1; if (!acc[b]) acc[b] = []; acc[b].push(d); return acc
  }, {})

  function RosterColumn({ roster, stats, label }: { roster: RosterPlayer[]; stats: Record<string, PlayerStats>; label: string }) {
    if (roster.length === 0) return (
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">{label}</p>
        <p className="text-xs text-gray-400 italic">Ni prijavljenih igralcev. Dodaj jih v upravljanje sezone.</p>
      </div>
    )
    return (
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">{label}</p>
        <div className="space-y-1">
          {roster.map(p => {
            const s = stats[p.playerId] || EMPTY_STATS
            const e = evalPlayer(s, useBlock2Rule)
            const violation = e.anyViolation
            const violationTitle = e.countViolation ? `Preveč disciplin (max ${e.maxAllowed})!` : 'Vse 3 tehnične discipline!'
            return (
              <div key={p.playerId} className={`flex items-center justify-between py-1 px-2 rounded-lg ${violation ? 'bg-red-50' : e.atMax ? 'bg-amber-50' : 'bg-gray-50'}`}>
                <span className={`text-xs ${violation || e.atMax ? 'font-medium' : ''} text-gray-700`}>{p.name}</span>
                <div className="flex items-center gap-1.5 ml-2 shrink-0">
                  <span className={`text-xs font-mono px-1.5 py-0.5 rounded-full font-semibold ${
                    s.count === 0 ? 'bg-gray-200 text-gray-400' :
                    violation ? 'bg-red-100 text-red-600' :
                    e.atMax ? 'bg-amber-100 text-amber-700' :
                    'bg-bocce-lime/20 text-bocce-lime'}`}>
                    {s.count}/{e.maxAllowed}
                  </span>
                  {s.count > 0 && (
                    <span className="text-xs text-gray-400">
                      {[...s.techTypes].map(t => t === 'stafeta' ? 'Š' : t === 'hitrostno' ? 'H' : 'N').join('·')}
                    </span>
                  )}
                  {violation && <span className="text-red-500 text-xs font-bold" title={violationTitle}>⚠</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/admin/liga" className="text-sm text-gray-500 hover:text-gray-700">← Nazaj na ligo</Link>
        {!canEdit && (
          <span className="text-xs bg-gray-100 text-gray-500 border border-gray-200 px-2.5 py-1 rounded-full">
            Samo za branje
          </span>
        )}
      </div>

      {/* Score header */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-gray-400 uppercase tracking-widest">Zapisnik ligaške tekme</p>
          {/* Datum tekme — vedno vidno, urejanje samo za admina/sodnika */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">Datum:</label>
            {canEdit ? (
              <input
                type="date"
                value={matchDate}
                onChange={e => setMatchDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-bocce-green outline-none"
              />
            ) : (
              <span className="text-sm text-gray-600 font-medium">
                {matchDate
                  ? new Date(matchDate).toLocaleDateString('sl-SI', { day: 'numeric', month: 'numeric', year: 'numeric' })
                  : '—'}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <div className="text-right flex-1 min-w-[150px]">
            <p className="font-bold text-gray-800 text-xl">{fixture.home_team?.club_name ?? '—'}</p>
            <p className="text-xs text-gray-400">Domači</p>
          </div>
          <div className="text-center px-4">
            <div className="text-5xl font-bold text-bocce-green font-mono leading-none">
              {runHome}<span className="text-gray-200 mx-2">:</span>{runAway}
            </div>
            <p className="text-xs text-gray-400 mt-1">točke disciplin</p>
            <p className="text-sm font-mono text-gray-500 mt-1.5">{runHomePunt} : {runAwayPunt}</p>
            <p className="text-xs text-gray-400">punt razlika</p>
          </div>
          <div className="text-left flex-1 min-w-[150px]">
            <p className="font-bold text-gray-800 text-xl">{fixture.away_team?.club_name ?? '—'}</p>
            <p className="text-xs text-gray-400">Gostje</p>
          </div>
        </div>
      </div>

      {/* Judge delegation — admin only */}
      {isAdmin && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Delegacija sodnikov</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Glavni sodnik (račun)</label>
              <select value={chiefJudgeUserId} onChange={e => assignChiefJudge(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                <option value="">— ni določen —</option>
                {allUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
              {chiefJudgeUserId && (
                <p className="text-xs text-bocce-green mt-1">✓ Ima dostop do urejanja zapisnika</p>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Sodniki (račun)</label>
              <div className="flex gap-2">
                <select defaultValue=""
                  onChange={e => { if (e.target.value) { addJudgeUser(e.target.value); e.currentTarget.value = '' } }}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-bocce-green outline-none">
                  <option value="">+ Dodaj sodnika</option>
                  {allUsers.filter(u => u.id !== chiefJudgeUserId && !judgeUserIds.includes(u.id)).map(u => (
                    <option key={u.id} value={u.id}>{u.full_name}</option>
                  ))}
                </select>
              </div>
              {judgeUserIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {judgeUserIds.map(uid => {
                    const u = allUsers.find(x => x.id === uid)
                    return (
                      <span key={uid} className="flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full">
                        {u?.full_name ?? uid.slice(0, 8)}
                        <button onClick={() => removeJudgeUser(uid)} className="text-gray-400 hover:text-red-500 ml-0.5">×</button>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Team rosters */}
      <div className="bg-white border border-gray-200 rounded-2xl mb-5 overflow-hidden">
        <button onClick={() => setRosterOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
          <span className="text-sm font-semibold text-gray-700">Sestava ekip</span>
          <div className="flex items-center gap-3">
            {violations.length > 0 && (
              <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
                {violations.length} kršitev
              </span>
            )}
            <span className="text-gray-400 text-sm">{rosterOpen ? '▲' : '▼'}</span>
          </div>
        </button>
        {rosterOpen && (
          <div className="px-5 pb-5 border-t border-gray-100">
            <p className="text-xs text-gray-400 mt-3 mb-4">
              {useBlock2Rule
                ? <>Igralka lahko nastopi v max <strong>3 disciplinah</strong>; izjemoma <strong>4</strong>, le če v 2. bloku igra <strong>Hitrostno + Štafeta</strong>. Pri 3 disciplinah je kombinacija v 2. bloku prosta.</>
                : <>Vsak igralec more nastopiti v max <strong>3 disciplinah</strong>. Oznaka tehničnih tipov: <strong>Š</strong>=štafeta · <strong>H</strong>=hitrostno · <strong>N</strong>=natančno — ne sme nastopiti v vseh treh.</>}
            </p>
            <div className="grid sm:grid-cols-2 gap-6">
              <RosterColumn roster={homeRoster} stats={homeStats} label={fixture.home_team?.club_name ?? 'Domači'} />
              <RosterColumn roster={awayRoster} stats={awayStats} label={fixture.away_team?.club_name ?? 'Gostje'} />
            </div>
            {violations.length > 0 && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-1">
                {violations.map((v, i) => <p key={i} className="text-xs text-red-600">⚠ {v}</p>)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Žreb */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Žreb igrišč</h3>
        <div className="flex items-start gap-4 flex-wrap">
          <div>
            <p className="text-xs text-gray-500 mb-2">Natančno izbijanje poteka na igrišču:</p>
            <div className="flex gap-2">
              {([1, 4] as const).map(f => (
                <button key={f} onClick={() => canEdit && setDrawNatancno(f)} disabled={!canEdit}
                  className={`w-12 h-12 rounded-xl font-bold text-lg border-2 transition-all ${drawNatancno === f ? 'border-bocce-green bg-bocce-green text-white' : canEdit ? 'border-gray-200 text-gray-600 hover:border-bocce-green' : 'border-gray-100 text-gray-300 cursor-default'}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          {drawNatancno && (
            <div className="flex-1 bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-600 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1">
              <span><span className="font-semibold">Štafeta:</span> igrišče {drawNatancno === 1 ? '2 in 4' : '1 in 3'}</span>
              <span><span className="font-semibold">Natančno:</span> igrišče {drawNatancno}</span>
              <span><span className="font-semibold">Posamezno 1:</span> igrišče {drawNatancno === 1 ? '3' : '2'}</span>
              <span><span className="font-semibold">Krog:</span> igrišče {drawNatancno === 1 ? '4' : '1'}</span>
              <span><span className="font-semibold">Hitrostno:</span> igrišče {drawNatancno === 1 ? '2 in 4' : '1 in 3'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Disciplines */}
      {disciplines.length === 0 ? (
        <div className="text-center py-10 text-gray-400 italic text-sm">
          Ni disciplin. <Link to="/admin/liga" className="text-bocce-green underline">Nastavi discipline →</Link>
        </div>
      ) : (
        <div className="space-y-6 mb-6">
          {Object.keys(blocks).map(Number).sort((a, b) => a - b).map(blockNum => (
            <div key={blockNum}>
              <div className="flex items-center gap-3 mb-3 px-1">
                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold
                  ${blockNum === 1 ? 'bg-bocce-green text-white' : blockNum === 2 ? 'bg-blue-500 text-white' : blockNum === 3 ? 'bg-orange-500 text-white' : 'bg-bocce-gold text-bocce-green'}`}>
                  {blockNum}
                </span>
                <span className="font-semibold text-gray-700">{BLOCK_LABELS[blockNum] ?? `Blok ${blockNum}`}</span>
              </div>

              {blockNum === 4 && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-3">
                  <p className="text-xs text-gray-500 mb-3">Žreb igrišč za Blok 4:</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {BLOK4_DISCIPLINES.filter(name => blocks[4]?.some(d => d.name === name)).map(name => (
                      <div key={name}>
                        <p className="text-xs font-medium text-gray-700 mb-1.5">{name}</p>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4].map(f => (
                            <button key={f} onClick={() => canEdit && setBlok4Field(name, f)}
                              className={`w-8 h-8 rounded-lg text-xs font-bold border transition-all ${
                                drawBlok4[name] === f ? 'border-bocce-green bg-bocce-green text-white' :
                                !canEdit ? 'border-gray-100 text-gray-300 cursor-default' :
                                Object.values(drawBlok4).includes(f) ? 'border-gray-100 text-gray-300 cursor-not-allowed' :
                                'border-gray-200 text-gray-600 hover:border-bocce-green'
                              }`}
                              disabled={!canEdit || (Object.values(drawBlok4).includes(f) && drawBlok4[name] !== f)}>
                              {f}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {blocks[blockNum].map(disc => {
                  const f = forms[disc.id]; if (!f) return null
                  const pts = calcPoints(f.homeScore, f.awayScore)
                  const playground = BLOK4_DISCIPLINES.includes(disc.name)
                    ? getBlok4Playground(disc.name, drawBlok4)
                    : getAutoPlayground(disc.name, drawNatancno)
                  const isTech = TECHNICAL_TYPES.includes(disc.discipline_type as DisciplineType)

                  return (
                    <div key={disc.id} className="bg-white border border-gray-200 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold text-sm text-gray-800 w-32 shrink-0">{disc.name}</span>
                        {isTech && <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded-full">tehnična</span>}
                        {playground ? (
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Igrišče {playground}</span>
                        ) : (
                          <span className="text-xs text-gray-300 italic">igrišče — žreb</span>
                        )}
                        {pts && (
                          <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${
                            pts[0] === 2 ? 'bg-bocce-lime/20 text-bocce-lime' :
                            pts[0] === 0 ? 'bg-red-50 text-red-400' :
                            'bg-gray-100 text-gray-500'}`}>
                            {pts[0] === 2 ? 'Dom. zmaga' : pts[0] === 0 ? 'Gost. zmaga' : 'Izenačeno'}
                          </span>
                        )}
                      </div>

                      <div className="flex items-start gap-2 flex-wrap">
                        <div className="flex-1 min-w-[140px] space-y-1">
                          {f.homePlayers.map((p, i) => (
                            <PlayerSelect key={i} value={p} onChange={v => setPlayer(disc.id, 'home', i, v)}
                              roster={homeRoster} stats={homeStats}
                              currentDiscType={disc.discipline_type as DisciplineType} isTechnical={isTech} useBlock2Rule={useBlock2Rule} />
                          ))}
                          {disc.has_reserve && (
                            <PlayerSelect value={f.homeReserve} onChange={v => setFormField(disc.id, 'homeReserve', v)}
                              roster={homeRoster} stats={homeStats}
                              currentDiscType={disc.discipline_type as DisciplineType} isTechnical={false} useBlock2Rule={useBlock2Rule} />
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                          <input type="number" min="0" value={f.homeScore} onChange={e => canEdit && setFormField(disc.id, 'homeScore', e.target.value)} readOnly={!canEdit}
                            className={`w-14 border rounded-lg px-2 py-1.5 text-center text-base font-bold outline-none ${canEdit ? 'border-gray-300 focus:ring-2 focus:ring-bocce-green' : 'border-gray-200 bg-gray-50 text-gray-600'}`} />
                          <span className="text-gray-300 font-bold">:</span>
                          <input type="number" min="0" value={f.awayScore} onChange={e => canEdit && setFormField(disc.id, 'awayScore', e.target.value)} readOnly={!canEdit}
                            className={`w-14 border rounded-lg px-2 py-1.5 text-center text-base font-bold outline-none ${canEdit ? 'border-gray-300 focus:ring-2 focus:ring-bocce-green' : 'border-gray-200 bg-gray-50 text-gray-600'}`} />
                          <div className={`w-14 text-center text-xs font-bold py-1.5 rounded-lg transition-colors ${
                            pts === null   ? 'text-gray-200 bg-gray-50 border border-gray-100' :
                            pts[0] === 2  ? 'bg-bocce-lime/20 text-bocce-lime border border-bocce-lime/30' :
                            pts[0] === 0  ? 'bg-red-50 text-red-400 border border-red-100' :
                            'bg-yellow-50 text-yellow-600 border border-yellow-200'}`}>
                            {pts ? `${pts[0]} : ${pts[1]}` : '– : –'}
                          </div>
                        </div>

                        <div className="flex-1 min-w-[140px] space-y-1">
                          {f.awayPlayers.map((p, i) => (
                            <PlayerSelect key={i} value={p} onChange={v => setPlayer(disc.id, 'away', i, v)}
                              roster={awayRoster} stats={awayStats}
                              currentDiscType={disc.discipline_type as DisciplineType} isTechnical={isTech} useBlock2Rule={useBlock2Rule} />
                          ))}
                          {disc.has_reserve && (
                            <PlayerSelect value={f.awayReserve} onChange={v => setFormField(disc.id, 'awayReserve', v)}
                              roster={awayRoster} stats={awayStats}
                              currentDiscType={disc.discipline_type as DisciplineType} isTechnical={false} useBlock2Rule={useBlock2Rule} />
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {message && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm border ${message.startsWith('❌') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
          {message}
        </div>
      )}

      <div className="flex gap-3 justify-end">
        <Link to="/admin/liga" className="border border-gray-300 text-gray-600 px-5 py-2.5 rounded-lg text-sm hover:bg-gray-50">
          {canEdit ? 'Prekliči' : '← Nazaj'}
        </Link>
        {canEdit && (
          <button onClick={save} disabled={saving || disciplines.length === 0}
            className="bg-bocce-green text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-bocce-green-light disabled:opacity-50 transition-colors">
            {saving ? 'Shranjujem...' : existingResultId ? 'Posodobi zapisnik' : 'Shrani zapisnik'}
          </button>
        )}
      </div>
    </div>
  )
}
