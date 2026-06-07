import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BLOCK_LABELS } from '../../engines/leagueDisciplines'
import { getAutoPlayground, getBlok4Playground, BLOK4_DISCIPLINES } from '../../engines/leaguePlaygrounds'
import type { DisciplineType } from '../../types'

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
interface PlayerStats { count: number; techTypes: Set<DisciplineType>; hasAllTechTypes: boolean }

const DEMO_DISCIPLINES = [
  { id: 'd1',  name: 'ŠTAFETA',     discipline_type: 'stafeta'   as DisciplineType, players_per_side: 2, has_reserve: false, block_number: 1, order_num: 1  },
  { id: 'd2',  name: 'KROG',        discipline_type: 'krog'      as DisciplineType, players_per_side: 1, has_reserve: false, block_number: 2, order_num: 2  },
  { id: 'd3',  name: 'POSAMEZNO 1', discipline_type: 'posamezno' as DisciplineType, players_per_side: 1, has_reserve: false, block_number: 2, order_num: 3  },
  { id: 'd4',  name: 'NATANČNO 1',  discipline_type: 'natancno'  as DisciplineType, players_per_side: 1, has_reserve: false, block_number: 2, order_num: 4  },
  { id: 'd5',  name: 'NATANČNO 2',  discipline_type: 'natancno'  as DisciplineType, players_per_side: 1, has_reserve: false, block_number: 2, order_num: 5  },
  { id: 'd6',  name: 'HITROSTNO 1', discipline_type: 'hitrostno' as DisciplineType, players_per_side: 1, has_reserve: false, block_number: 3, order_num: 6  },
  { id: 'd7',  name: 'DVOJKA 1',    discipline_type: 'dvojka'    as DisciplineType, players_per_side: 2, has_reserve: true,  block_number: 4, order_num: 7  },
  { id: 'd8',  name: 'DVOJKA 2',    discipline_type: 'dvojka'    as DisciplineType, players_per_side: 2, has_reserve: true,  block_number: 4, order_num: 8  },
  { id: 'd9',  name: 'POSAMEZNO 2', discipline_type: 'posamezno' as DisciplineType, players_per_side: 1, has_reserve: false, block_number: 4, order_num: 9  },
  { id: 'd10', name: 'POSAMEZNO 3', discipline_type: 'posamezno' as DisciplineType, players_per_side: 1, has_reserve: false, block_number: 4, order_num: 10 },
]

const HOME_ROSTER: RosterPlayer[] = [
  { playerId: 'h1', name: 'Jure Fabjan' },
  { playerId: 'h2', name: 'Primož Markočič' },
  { playerId: 'h3', name: 'Blaž Morato' },
  { playerId: 'h4', name: 'Matej Košir' },
  { playerId: 'h5', name: 'Branko Urdih' },
  { playerId: 'h6', name: 'Jasmin Švara' },
  { playerId: 'h7', name: 'Rok Pirc' },
]

const AWAY_ROSTER: RosterPlayer[] = [
  { playerId: 'a1', name: 'Luka Kukuljan' },
  { playerId: 'a2', name: 'Marko Jagodnik' },
  { playerId: 'a3', name: 'Sandi Žuran' },
  { playerId: 'a4', name: 'Andrej Kastelic' },
  { playerId: 'a5', name: 'Renato Kastelic' },
  { playerId: 'a6', name: 'Urban Likar' },
  { playerId: 'a7', name: 'Tomaž Novak' },
]

// Player IDs match HOME_ROSTER / AWAY_ROSTER playerId fields
const INIT_FORMS: Record<string, DisciplineForm> = {
  d1:  { homeScore: '31', awayScore: '42', homePlayers: ['h1', 'h6'],     awayPlayers: ['a1', 'a4'],     homeReserve: '',  awayReserve: '' },
  d2:  { homeScore: '19', awayScore: '21', homePlayers: ['h1'],           awayPlayers: ['a2'],           homeReserve: '',  awayReserve: '' },
  d3:  { homeScore: '8',  awayScore: '7',  homePlayers: ['h2'],           awayPlayers: ['a1'],           homeReserve: '',  awayReserve: '' },
  d4:  { homeScore: '18', awayScore: '15', homePlayers: ['h3'],           awayPlayers: ['a3'],           homeReserve: '',  awayReserve: '' },
  d5:  { homeScore: '13', awayScore: '5',  homePlayers: ['h2'],           awayPlayers: ['a2'],           homeReserve: '',  awayReserve: '' },
  d6:  { homeScore: '28', awayScore: '41', homePlayers: ['h4'],           awayPlayers: ['a1'],           homeReserve: '',  awayReserve: '' },
  d7:  { homeScore: '10', awayScore: '3',  homePlayers: ['h2', 'h5'],     awayPlayers: ['a6', 'a5'],     homeReserve: 'h4', awayReserve: '' },
  d8:  { homeScore: '',   awayScore: '',   homePlayers: ['', ''],         awayPlayers: ['', ''],         homeReserve: '',  awayReserve: '' },
  d9:  { homeScore: '',   awayScore: '',   homePlayers: [''],             awayPlayers: [''],             homeReserve: '',  awayReserve: '' },
  d10: { homeScore: '',   awayScore: '',   homePlayers: [''],             awayPlayers: [''],             homeReserve: '',  awayReserve: '' },
}

function calcPoints(h: string, a: string): [0 | 1 | 2, 0 | 1 | 2] | null {
  if (!h || !a) return null
  const hn = Number(h), an = Number(a)
  if (hn > an) return [2, 0]
  if (an > hn) return [0, 2]
  return [1, 1]   // izenačeno
}

function computeStats(forms: Record<string, DisciplineForm>, side: 'home' | 'away'): Record<string, PlayerStats> {
  const stats: Record<string, PlayerStats> = {}
  function add(name: string, disc: typeof DEMO_DISCIPLINES[0]) {
    if (!name.trim()) return
    if (!stats[name]) stats[name] = { count: 0, techTypes: new Set(), hasAllTechTypes: false }
    stats[name].count++
    if (TECHNICAL_TYPES.includes(disc.discipline_type)) stats[name].techTypes.add(disc.discipline_type)
  }
  for (const disc of DEMO_DISCIPLINES) {
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

function PlayerSelect({ value, onChange, roster, stats, currentDiscType, isTechnical }: {
  value: string
  onChange: (v: string) => void
  roster: RosterPlayer[]
  stats: Record<string, PlayerStats>
  currentDiscType: DisciplineType
  isTechnical: boolean
}) {
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
        const s = stats[p.playerId] || { count: 0, techTypes: new Set(), hasAllTechTypes: false }
        const atMax = s.count >= 3 && value !== p.playerId
        const techWarn = wouldViolateTech(p.playerId) && value !== p.playerId
        return (
          <option key={p.playerId} value={p.playerId} disabled={atMax}>
            {p.name}{s.count > 0 ? ` (${s.count}/3)` : ''}{techWarn ? ' ⚠' : ''}{atMax ? ' — max' : ''}
          </option>
        )
      })}
    </select>
  )
}

export default function LeagueMatchScoresheetDemo() {
  const [forms, setForms] = useState(INIT_FORMS)
  const [judges, setJudges] = useState('Žvokelj, Petrič, Marc')
  const [chiefJudge, setChiefJudge] = useState('MIKUŽ Slavko')
  const [viewers, setViewers] = useState('47')
  const [timeEnd, setTimeEnd] = useState('19:30')
  const [drawNatancno, setDrawNatancno] = useState<1 | 4 | null>(1)
  const [drawBlok4, setDrawBlok4] = useState<Record<string, number>>({ 'DVOJKA 1': 3, 'DVOJKA 2': 1 })
  const [rosterOpen, setRosterOpen] = useState(true)

  function setField(id: string, field: keyof DisciplineForm, value: string) {
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

  const homeStats = useMemo(() => computeStats(forms, 'home'), [forms])
  const awayStats = useMemo(() => computeStats(forms, 'away'), [forms])

  const violations = useMemo(() => {
    const errs: string[] = []
    const resolveName = (id: string, roster: RosterPlayer[]) =>
      roster.find(p => p.playerId === id)?.name ?? id
    for (const [id, s] of Object.entries(homeStats)) {
      const name = resolveName(id, HOME_ROSTER)
      if (s.count > 3) errs.push(`${name} (dom.): nastopa v ${s.count} disciplinah (max 3)`)
      if (s.hasAllTechTypes) errs.push(`${name} (dom.): nastopa v vseh 3 tehničnih disciplinah`)
    }
    for (const [id, s] of Object.entries(awayStats)) {
      const name = resolveName(id, AWAY_ROSTER)
      if (s.count > 3) errs.push(`${name} (gost.): nastopa v ${s.count} disciplinah (max 3)`)
      if (s.hasAllTechTypes) errs.push(`${name} (gost.): nastopa v vseh 3 tehničnih disciplinah`)
    }
    return errs
  }, [homeStats, awayStats])

  let runHome = 0, runAway = 0, runHomePunt = 0, runAwayPunt = 0
  for (const disc of DEMO_DISCIPLINES) {
    const f = forms[disc.id]; if (!f) continue
    const pts = calcPoints(f.homeScore, f.awayScore)
    if (pts) { runHome += pts[0]; runAway += pts[1] }
    if (f.homeScore) runHomePunt += Number(f.homeScore)
    if (f.awayScore) runAwayPunt += Number(f.awayScore)
  }

  const blocks = DEMO_DISCIPLINES.reduce<Record<number, typeof DEMO_DISCIPLINES>>((acc, d) => {
    if (!acc[d.block_number]) acc[d.block_number] = []; acc[d.block_number].push(d); return acc
  }, {})

  function RosterColumn({ roster, stats, label }: { roster: RosterPlayer[]; stats: Record<string, PlayerStats>; label: string }) {
    return (
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">{label}</p>
        <div className="space-y-1">
          {roster.map(p => {
            const s = stats[p.playerId] || { count: 0, techTypes: new Set(), hasAllTechTypes: false }
            const atMax = s.count >= 3
            const techViolation = s.hasAllTechTypes
            return (
              <div key={p.playerId} className={`flex items-center justify-between py-1 px-2 rounded-lg ${techViolation ? 'bg-red-50' : atMax ? 'bg-amber-50' : 'bg-gray-50'}`}>
                <span className={`text-xs ${techViolation || atMax ? 'font-medium' : ''} text-gray-700`}>{p.name}</span>
                <div className="flex items-center gap-1.5 ml-2 shrink-0">
                  <span className={`text-xs font-mono px-1.5 py-0.5 rounded-full font-semibold ${
                    s.count === 0 ? 'bg-gray-200 text-gray-400' :
                    atMax ? 'bg-red-100 text-red-600' :
                    s.count === 2 ? 'bg-amber-100 text-amber-700' :
                    'bg-bocce-lime/20 text-bocce-lime'}`}>
                    {s.count}/3
                  </span>
                  {s.count > 0 && (
                    <span className="text-xs text-gray-400">
                      {[...s.techTypes].map(t => t === 'stafeta' ? 'Š' : t === 'hitrostno' ? 'H' : 'N').join('·')}
                    </span>
                  )}
                  {techViolation && <span className="text-red-500 text-xs font-bold" title="Vse 3 tehnične discipline!">⚠</span>}
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
      <div className="flex items-center gap-3 mb-4">
        <Link to="/admin/liga" className="text-sm text-gray-500 hover:text-gray-700">← Nazaj na ligo</Link>
        <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">DEMO predogled</span>
      </div>

      {/* Score header */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-5">
        <p className="text-center text-xs text-gray-400 uppercase tracking-widest mb-1">Super Liga 2025/26</p>
        <p className="text-center text-xs text-gray-400 mb-4">25. 10. 2025 · 16:00 · Nova Gorica</p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <div className="text-right flex-1 min-w-[160px]">
            <p className="font-bold text-gray-800 text-xl">HRAST KOBJEGLAVA</p>
            <p className="text-xs text-gray-400">Domači</p>
          </div>
          <div className="text-center px-6">
            <div className="text-5xl font-bold text-bocce-green font-mono leading-none">
              {runHome}<span className="text-gray-200 mx-2">:</span>{runAway}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">točke disciplin</p>
            <p className="text-base font-mono font-semibold text-gray-500 mt-2">{runHomePunt} : {runAwayPunt}</p>
            <p className="text-xs text-gray-400">punt razlika</p>
          </div>
          <div className="text-left flex-1 min-w-[160px]">
            <p className="font-bold text-gray-800 text-xl">TERMOPLASTI PLAMA</p>
            <p className="text-xs text-gray-400">Gostje</p>
          </div>
        </div>
      </div>

      {/* Judges */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5 grid sm:grid-cols-4 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Sodniki</label>
          <input value={judges} onChange={e => setJudges(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Glavni sodnik</label>
          <input value={chiefJudge} onChange={e => setChiefJudge(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none" />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Gledalci</label>
            <input type="number" value={viewers} onChange={e => setViewers(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none" />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Konec ob</label>
            <input type="time" value={timeEnd} onChange={e => setTimeEnd(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none" />
          </div>
        </div>
      </div>

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
              Vsak igralec može nastopiti v max <strong>3 disciplinah</strong>. Oznaka tehničnih tipov: <strong>Š</strong>=štafeta · <strong>H</strong>=hitrostno · <strong>N</strong>=natančno — ne sme nastopiti v vseh treh.
            </p>
            <div className="grid sm:grid-cols-2 gap-6">
              <RosterColumn roster={HOME_ROSTER} stats={homeStats} label="HRAST KOBJEGLAVA" />
              <RosterColumn roster={AWAY_ROSTER} stats={awayStats} label="TERMOPLASTI PLAMA" />
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
                <button key={f} onClick={() => setDrawNatancno(f)}
                  className={`w-12 h-12 rounded-xl font-bold text-lg border-2 transition-all ${drawNatancno === f ? 'border-bocce-green bg-bocce-green text-white' : 'border-gray-200 text-gray-600 hover:border-bocce-green'}`}>
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

      {/* Disciplines by block */}
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
                  {BLOK4_DISCIPLINES.map(name => (
                    <div key={name}>
                      <p className="text-xs font-medium text-gray-700 mb-1.5">{name}</p>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map(f => (
                          <button key={f} onClick={() => setBlok4Field(name, f)}
                            className={`w-8 h-8 rounded-lg text-xs font-bold border transition-all ${
                              drawBlok4[name] === f ? 'border-bocce-green bg-bocce-green text-white' :
                              Object.values(drawBlok4).includes(f) ? 'border-gray-100 text-gray-300 cursor-not-allowed' :
                              'border-gray-200 text-gray-600 hover:border-bocce-green'
                            }`}
                            disabled={Object.values(drawBlok4).includes(f) && drawBlok4[name] !== f}>
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
                const isTech = TECHNICAL_TYPES.includes(disc.discipline_type)

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
                            roster={HOME_ROSTER} stats={homeStats}
                            currentDiscType={disc.discipline_type} isTechnical={isTech} />
                        ))}
                        {disc.has_reserve && (
                          <PlayerSelect value={f.homeReserve} onChange={v => setField(disc.id, 'homeReserve', v)}
                            roster={HOME_ROSTER} stats={homeStats}
                            currentDiscType={disc.discipline_type} isTechnical={false} />
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                        <input type="number" min="0" value={f.homeScore} onChange={e => setField(disc.id, 'homeScore', e.target.value)}
                          className="w-14 border border-gray-300 rounded-lg px-2 py-1.5 text-center text-base font-bold focus:ring-2 focus:ring-bocce-green outline-none" />
                        <span className="text-gray-300 font-bold">:</span>
                        <input type="number" min="0" value={f.awayScore} onChange={e => setField(disc.id, 'awayScore', e.target.value)}
                          className="w-14 border border-gray-300 rounded-lg px-2 py-1.5 text-center text-base font-bold focus:ring-2 focus:ring-bocce-green outline-none" />
                        <div className={`w-14 text-center text-xs font-bold py-1.5 rounded-lg transition-colors ${
                          pts === null  ? 'text-gray-200 bg-gray-50 border border-gray-100' :
                          pts[0] === 2 ? 'bg-bocce-lime/20 text-bocce-lime border border-bocce-lime/30' :
                          pts[0] === 0 ? 'bg-red-50 text-red-400 border border-red-100' :
                          'bg-yellow-50 text-yellow-600 border border-yellow-200'}`}>
                          {pts ? `${pts[0]} : ${pts[1]}` : '– : –'}
                        </div>
                      </div>

                      <div className="flex-1 min-w-[140px] space-y-1">
                        {f.awayPlayers.map((p, i) => (
                          <PlayerSelect key={i} value={p} onChange={v => setPlayer(disc.id, 'away', i, v)}
                            roster={AWAY_ROSTER} stats={awayStats}
                            currentDiscType={disc.discipline_type} isTechnical={isTech} />
                        ))}
                        {disc.has_reserve && (
                          <PlayerSelect value={f.awayReserve} onChange={v => setField(disc.id, 'awayReserve', v)}
                            roster={AWAY_ROSTER} stats={awayStats}
                            currentDiscType={disc.discipline_type} isTechnical={false} />
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

      <div className="flex gap-3 justify-end">
        <Link to="/admin/liga" className="border border-gray-300 text-gray-600 px-5 py-2.5 rounded-lg text-sm hover:bg-gray-50">Prekliči</Link>
        <button className="bg-bocce-green text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-bocce-green-light transition-colors">
          Shrani zapisnik
        </button>
      </div>
    </div>
  )
}
