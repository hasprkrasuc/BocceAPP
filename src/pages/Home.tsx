import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { sl } from '../i18n/sl'
import { format } from 'date-fns'
import { sl as dateSl } from 'date-fns/locale'
import type { Tournament, TournamentCategory, TournamentStatus, TournamentKind } from '../types'

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

interface HomeStats { tournaments: number; players: number }

export default function Home() {
  const [upcoming, setUpcoming] = useState<Tournament[]>([])
  const [recent, setRecent] = useState<Tournament[]>([])
  const [stats, setStats] = useState<HomeStats>({ tournaments: 0, players: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: upcData }, { data: recData }, { count: tCount }, { count: pCount }] = await Promise.all([
        supabase.from('tournaments').select('*').in('status', ['registration_open', 'in_progress'])
          .gte('date', new Date().toISOString().slice(0, 10)).order('date').limit(3),
        supabase.from('tournaments').select('*').eq('status', 'completed').order('date', { ascending: false }).limit(3),
        supabase.from('tournaments').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
        supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'player'),
      ])
      setUpcoming((upcData ?? []) as Tournament[])
      setRecent((recData ?? []) as Tournament[])
      setStats({ tournaments: tCount ?? 0, players: pCount ?? 0 })
      setLoading(false)
    }
    load()
  }, [])

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
          { label: 'Odigranih tekem', value: '—', icon: '🎯' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-5 text-center border-t-4 border-t-bocce-lime">
            <div className="text-3xl mb-1">{s.icon}</div>
            <div className="text-2xl font-bold text-bocce-green">{s.value}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Upcoming tournaments */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">Prihajajoči turnirji</h2>
            <Link to="/turnirji" className="text-bocce-green text-sm hover:underline">Vsi →</Link>
          </div>
          {loading ? (
            <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : upcoming.length === 0 ? (
            <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-400 italic">Ni prihajajočih turnirjev</div>
          ) : (
            <div className="space-y-3">
              {upcoming.map(t => (
                <Link key={t.id} to={`/${t.kind === 'championship' ? 'prvenstva' : 'turnirji'}/${t.id}`}
                  className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-bocce-green hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-gray-800">{t.name}</h3>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {format(new Date(t.date), 'd. MMMM yyyy', { locale: dateSl })} · {t.location}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[t.category]}`}>
                      {CATEGORY_LABELS[t.category]}
                    </span>
                  </div>
                  {t.status === 'registration_open' && (
                    <span className="inline-block mt-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                      Prijave odprte
                    </span>
                  )}
                  {t.status === 'in_progress' && (
                    <span className="inline-block mt-2 text-xs bg-bocce-gold/20 text-bocce-gold px-2 py-0.5 rounded-full">
                      V teku
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent results */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">Zadnji rezultati</h2>
            <Link to="/arhiv" className="text-bocce-green text-sm hover:underline">Arhiv →</Link>
          </div>
          {loading ? (
            <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : recent.length === 0 ? (
            <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-400 italic">Ni zaključenih turnirjev</div>
          ) : (
            <div className="space-y-3">
              {recent.map(t => (
                <Link key={t.id} to={`/${t.kind === 'championship' ? 'prvenstva' : 'turnirji'}/${t.id}`}
                  className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-bocce-green hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-gray-800">{t.name}</h3>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {format(new Date(t.date), 'd. MMMM yyyy', { locale: dateSl })} · {t.location}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[t.category]}`}>
                      {CATEGORY_LABELS[t.category]}
                    </span>
                  </div>
                  <span className="inline-block mt-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                    Zaključen
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
