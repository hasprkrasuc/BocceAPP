import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { format } from 'date-fns'
import { sl as dateSl } from 'date-fns/locale'
import type { Tournament, TournamentCategory } from '../types'

const CATEGORY_LABELS: Record<TournamentCategory, string> = {
  men: 'Moški', women: 'Ženske', u18: 'U18', mixed: 'Mešano',
  u18_women: 'U18 Ženske', u15: 'U15', u12: 'U12',
}
const CATEGORY_COLORS: Record<TournamentCategory, string> = {
  men: 'bg-blue-50 text-blue-700 border-blue-200',
  women: 'bg-pink-50 text-pink-700 border-pink-200',
  u18: 'bg-purple-50 text-purple-700 border-purple-200',
  mixed: 'bg-amber-50 text-amber-700 border-amber-200',
  u18_women: 'bg-rose-50 text-rose-700 border-rose-200',
  u15: 'bg-orange-50 text-orange-700 border-orange-200',
  u12: 'bg-green-50 text-green-700 border-green-200',
}

interface HomeStats { tournaments: number; players: number; matches: number }

type TeamRel = { club_name: string } | { club_name: string }[] | null
interface FixtureLite {
  id: string
  scheduled_date: string
  venue: string | null
  home_score: number | null
  away_score: number | null
  season_id: string
  home: TeamRel
  away: TeamRel
}
const teamName = (r: TeamRel) => (Array.isArray(r) ? r[0]?.club_name : r?.club_name) ?? '?'
const fmtDate = (d: string) => format(new Date(d), 'd. MMM yyyy', { locale: dateSl })

const LIGA_SELECT =
  'id, scheduled_date, venue, home_score, away_score, season_id, ' +
  'home:league_teams!league_fixtures_home_team_id_fkey(club_name), ' +
  'away:league_teams!league_fixtures_away_team_id_fkey(club_name)'

export default function Home() {
  const [ligaUpc, setLigaUpc] = useState<FixtureLite[]>([])
  const [ligaDone, setLigaDone] = useState<FixtureLite[]>([])
  const [champUpc, setChampUpc] = useState<Tournament[]>([])
  const [champDone, setChampDone] = useState<Tournament[]>([])
  const [tourUpc, setTourUpc] = useState<Tournament[]>([])
  const [tourDone, setTourDone] = useState<Tournament[]>([])
  const [stats, setStats] = useState<HomeStats>({ tournaments: 0, players: 0, matches: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().slice(0, 10)
      const T = () => supabase.from('tournaments').select('*')
      const F = () => supabase.from('league_fixtures').select(LIGA_SELECT)

      const [
        lUpc, lDone, cUpc, cDone, tUpc, tDone,
        { count: tCount }, { count: pCount }, { count: mCount }, { count: lfCount },
      ] = await Promise.all([
        F().neq('status', 'completed').gte('scheduled_date', today).order('scheduled_date').limit(3),
        F().eq('status', 'completed').order('scheduled_date', { ascending: false }).limit(3),
        T().eq('kind', 'championship').neq('status', 'completed').gte('date', today).order('date').limit(3),
        T().eq('kind', 'championship').eq('status', 'completed').order('date', { ascending: false }).limit(3),
        T().eq('kind', 'tournament').neq('status', 'completed').gte('date', today).order('date').limit(3),
        T().eq('kind', 'tournament').eq('status', 'completed').order('date', { ascending: false }).limit(3),
        supabase.from('tournaments').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
        supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'player'),
        supabase.from('matches').select('*', { count: 'exact', head: true }).eq('status', 'completed').eq('is_bye', false),
        supabase.from('league_fixtures').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      ])
      setLigaUpc((lUpc.data ?? []) as unknown as FixtureLite[])
      setLigaDone((lDone.data ?? []) as unknown as FixtureLite[])
      setChampUpc((cUpc.data ?? []) as Tournament[])
      setChampDone((cDone.data ?? []) as Tournament[])
      setTourUpc((tUpc.data ?? []) as Tournament[])
      setTourDone((tDone.data ?? []) as Tournament[])
      setStats({ tournaments: tCount ?? 0, players: pCount ?? 0, matches: (mCount ?? 0) + (lfCount ?? 0) })
      setLoading(false)
    }
    load()
  }, [])

  const tourItem = (t: Tournament) => (
    <Link key={t.id} to={`/${t.kind === 'championship' ? 'prvenstva' : 'turnirji'}/${t.id}`}
      className="block bg-white border border-gray-200 rounded-lg p-3 hover:border-bocce-green hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-medium text-sm text-gray-800 truncate">{t.name}</h4>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{fmtDate(t.date)} · {t.location}</p>
        </div>
        <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border ${CATEGORY_COLORS[t.category]}`}>
          {CATEGORY_LABELS[t.category]}
        </span>
      </div>
    </Link>
  )

  const fixtureItem = (f: FixtureLite) => {
    const done = f.home_score != null && f.away_score != null
    return (
      <Link key={f.id} to={`/liga/${f.season_id}`}
        className="block bg-white border border-gray-200 rounded-lg p-3 hover:border-bocce-green hover:shadow-sm transition-all">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-gray-800 truncate">
            {teamName(f.home)} <span className="text-gray-400">–</span> {teamName(f.away)}
          </span>
          {done && <span className="shrink-0 text-sm font-semibold text-bocce-green">{f.home_score}:{f.away_score}</span>}
        </div>
        <p className="text-xs text-gray-500 mt-0.5 truncate">{fmtDate(f.scheduled_date)}{f.venue ? ` · ${f.venue}` : ''}</p>
      </Link>
    )
  }

  const section = (title: string, items: ReactNode[], empty: string) => (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{title}</h4>
      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-400 italic text-sm">{empty}</div>
      ) : (
        <div className="space-y-2">{items}</div>
      )}
    </div>
  )

  const column = (title: string, to: string, upper: ReactNode, lower: ReactNode) => (
    <div className="bg-white/60 border border-gray-200 rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-bocce-green">{title}</h2>
        <Link to={to} className="text-bocce-green text-sm hover:underline">Vsi →</Link>
      </div>
      {upper}
      {lower}
    </div>
  )

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero */}
      <div className="bg-gradient-to-br from-bocce-green via-bocce-green to-bocce-green-dark rounded-2xl p-8 mb-8 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-bocce-lime/10 rounded-full -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-32 h-32 bg-bocce-lime/10 rounded-full translate-y-1/2 pointer-events-none" />
        <div className="max-w-2xl">
          <h1 className="text-4xl font-bold mb-3">Balinarska tekmovanja</h1>
          <p className="text-blue-200 text-lg mb-6">
            Upravljanje turnirjev, državnega ekipnega prvenstva in statistike
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/turnirji" className="bg-white text-bocce-green font-semibold px-5 py-2.5 rounded-lg hover:bg-gray-100 transition-colors">
              Turnirji
            </Link>
            <Link to="/prvenstva" className="bg-bocce-lime text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-bocce-lime-light transition-colors">
              Državna prvenstva
            </Link>
            <Link to="/liga" className="bg-white/15 text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-white/25 transition-colors border border-white/30">
              Državne lige
            </Link>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Zaključenih turnirjev', value: stats.tournaments, icon: '🏆' },
          { label: 'Registriranih igralcev', value: stats.players, icon: '👤' },
          { label: 'Odigranih tekem', value: stats.matches, icon: '🎯' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-5 text-center border-t-4 border-t-bocce-lime">
            <div className="text-3xl mb-1">{s.icon}</div>
            <div className="text-2xl font-bold text-bocce-green">{s.value}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* 3 stolpci */}
      <div className="grid md:grid-cols-3 gap-6">
        {column('Državne lige', '/liga',
          section('Prihajajoče tekme', ligaUpc.map(fixtureItem), 'Ni prihajajočih tekem'),
          section('Zadnje odigrane tekme', ligaDone.map(fixtureItem), 'Ni odigranih tekem'))}
        {column('Državna prvenstva', '/prvenstva',
          section('Prihajajoča prvenstva', champUpc.map(tourItem), 'Ni prihajajočih prvenstev'),
          section('Zadnja zaključena', champDone.map(tourItem), 'Ni zaključenih prvenstev'))}
        {column('Turnirji', '/turnirji',
          section('Prihajajoči turnirji', tourUpc.map(tourItem), 'Ni prihajajočih turnirjev'),
          section('Zadnji odigrani', tourDone.map(tourItem), 'Ni odigranih turnirjev'))}
      </div>
    </div>
  )
}
