import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'

interface CalendarEvent {
  id: string
  start_date: string | null
  end_date: string | null
  month_key: string
  category: string | null
  location: string | null
  title: string
  raw_date: string | null
  sort_order: number
}

const MONTHS_SL = ['januar', 'februar', 'marec', 'april', 'maj', 'junij', 'julij', 'avgust', 'september', 'oktober', 'november', 'december']
const monthLabel = (key: string): string => {
  const [y, m] = key.split('-')
  const name = MONTHS_SL[parseInt(m, 10) - 1] ?? m
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`
}

/** Barva kategorije po ključni besedi. */
function categoryStyle(cat: string | null): string {
  const c = (cat ?? '').toLowerCase()
  if (c.includes('superliga')) return 'bg-bocce-gold/15 text-yellow-700 border-bocce-gold/30'
  if (/\bu-?1[248]\b|mladin|deč|dekl/.test(c)) return 'bg-orange-100 text-orange-700 border-orange-200'
  if (c.includes('liga')) return 'bg-bocce-green/10 text-bocce-green border-bocce-green/20'
  if (c.includes('mednarodno') || c.includes('svetovni') || c.includes('evropsk')) return 'bg-blue-100 text-blue-700 border-blue-200'
  if (c.includes('dp') || c.includes('prvenstvo') || c.includes('pokal')) return 'bg-purple-100 text-purple-700 border-purple-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

const todayISO = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Calendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const currentMonthRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.from('calendar_events').select('*').order('sort_order', { ascending: true })
      .then(({ data }) => { setEvents((data ?? []) as CalendarEvent[]); setLoading(false) })
  }, [])

  const today = todayISO()
  const currentMonthKey = today.slice(0, 7)

  const months = useMemo(() => {
    const byMonth = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      if (!byMonth.has(e.month_key)) byMonth.set(e.month_key, [])
      byMonth.get(e.month_key)!.push(e)
    }
    return [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [events])

  useEffect(() => {
    if (!loading && currentMonthRef.current) {
      currentMonthRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [loading])

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Koledar</h1>
      <p className="text-sm text-gray-500 mb-8">Tekmovalni koledar Balinarske zveze Slovenije — sezona 2026/27.</p>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : months.length === 0 ? (
        <p className="text-gray-400 italic">Ni dogodkov.</p>
      ) : (
        <div className="space-y-8">
          {months.map(([key, evs]) => {
            const isCurrent = key === currentMonthKey
            return (
              <div key={key} ref={isCurrent ? currentMonthRef : undefined} className="scroll-mt-20">
                <h2 className={`text-lg font-bold mb-3 flex items-center gap-2 ${isCurrent ? 'text-bocce-green' : 'text-gray-700'}`}>
                  {monthLabel(key)}
                  {isCurrent && <span className="text-[11px] bg-bocce-green text-white px-2 py-0.5 rounded-full font-medium">trenutni mesec</span>}
                </h2>
                <div className="space-y-2">
                  {evs.map(e => {
                    const past = e.end_date ? e.end_date < today : (e.start_date ? e.start_date < today : false)
                    return (
                      <div key={e.id}
                        className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors
                          ${past ? 'border-gray-100 bg-gray-50/50 opacity-70' : 'border-gray-200 bg-white hover:border-bocce-green/40'}`}>
                        <div className="w-24 shrink-0">
                          <span className="text-sm font-semibold text-gray-800">{e.raw_date || '—'}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 leading-snug">{e.title}</p>
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            {e.category && (
                              <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${categoryStyle(e.category)}`}>
                                {e.category}
                              </span>
                            )}
                            {e.location && <span className="text-xs text-gray-500">📍 {e.location}</span>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
