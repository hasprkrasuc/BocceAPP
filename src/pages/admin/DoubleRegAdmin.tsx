/**
 * ADMIN — Upravljanje dvojnih registracij
 * Pregled vlog, odobritev ali zavrnitev
 */

import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { DoubleRegistration } from '../../types'
import { DR_TIER_LABELS, DR_STATUS_COLORS, DR_STATUS_LABELS } from '../../engines/doubleRegistration'

export default function DoubleRegAdmin() {
  const { user } = useAuth()
  const [regs, setRegs] = useState<DoubleRegistration[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')
  const [processing, setProcessing] = useState<string | null>(null)

  useEffect(() => { load() }, [filter])

  async function load() {
    setLoading(true)
    let q = supabase
      .from('double_registrations')
      .select(`
        *,
        player:users(id, full_name, club, date_of_birth),
        primary_team:league_teams!primary_team_id(id, club_name, season:league_seasons(name, tier)),
        secondary_team:league_teams!secondary_team_id(id, club_name, season:league_seasons(name, tier))
      `)
      .order('requested_at', { ascending: false })

    if (filter !== 'all') q = q.eq('status', filter)

    const { data } = await q
    setRegs((data ?? []) as DoubleRegistration[])
    setLoading(false)
  }

  async function resolve(id: string, status: 'approved' | 'rejected') {
    setProcessing(id)
    await supabase.from('double_registrations').update({
      status,
      resolved_at: new Date().toISOString(),
      resolved_by: user?.id,
    }).eq('id', id)

    // Če odobrimo → dodaj v league_team_players sekundarne ekipe
    if (status === 'approved') {
      const reg = regs.find(r => r.id === id)
      if (reg) {
        await supabase.from('league_team_players').insert({
          league_team_id: reg.secondary_team_id,
          player_id:      reg.player_id,
        })
      }
    }

    setProcessing(null)
    load()
  }

  const pending = regs.filter(r => r.status === 'pending').length

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dvojne registracije</h1>
          {pending > 0 && (
            <p className="text-sm text-yellow-700 font-medium mt-0.5">
              {pending} {pending === 1 ? 'vloga čaka' : 'vloge čakajo'} na odobritev
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f ? 'bg-bocce-green text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {f === 'all' ? 'Vse' : DR_STATUS_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : regs.length === 0 ? (
        <div className="text-center py-16 text-gray-400 italic">Ni vlog</div>
      ) : (
        <div className="space-y-3">
          {regs.map(reg => (
            <div key={reg.id} className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  {/* Igralec */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold text-gray-800">{reg.player?.full_name ?? '—'}</span>
                    <span className="text-xs text-gray-500">{reg.player?.club}</span>
                    {reg.player?.date_of_birth && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                        {new Date().getFullYear() - new Date(reg.player.date_of_birth).getFullYear()} let
                      </span>
                    )}
                  </div>

                  {/* Ekipe */}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="bg-bocce-green/10 text-bocce-green px-2 py-0.5 rounded font-medium">
                      {reg.primary_team?.club_name}
                      <span className="text-xs ml-1 opacity-70">
                        ({DR_TIER_LABELS[(reg.primary_team as { season?: { tier?: string } })?.season?.tier ?? ''] ?? '—'})
                      </span>
                    </span>
                    <span className="text-gray-400">→</span>
                    <span className="bg-bocce-gold/10 text-yellow-700 px-2 py-0.5 rounded font-medium">
                      {reg.secondary_team?.club_name}
                      <span className="text-xs ml-1 opacity-70">
                        ({DR_TIER_LABELS[(reg.secondary_team as { season?: { tier?: string } })?.season?.tier ?? ''] ?? '—'})
                      </span>
                    </span>
                  </div>

                  <p className="text-xs text-gray-400 mt-1.5">
                    Oddano: {new Date(reg.requested_at).toLocaleDateString('sl-SI')}
                    {reg.resolved_at && ` · Rešeno: ${new Date(reg.resolved_at).toLocaleDateString('sl-SI')}`}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {reg.status === 'pending' ? (
                    <>
                      <button
                        onClick={() => resolve(reg.id, 'approved')}
                        disabled={processing === reg.id}
                        className="bg-bocce-green text-white text-sm px-4 py-2 rounded-lg hover:bg-bocce-green-light transition-colors disabled:opacity-40"
                      >
                        {processing === reg.id ? '...' : '✓ Odobri'}
                      </button>
                      <button
                        onClick={() => resolve(reg.id, 'rejected')}
                        disabled={processing === reg.id}
                        className="border border-red-200 text-red-600 text-sm px-4 py-2 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40"
                      >
                        ✗ Zavrni
                      </button>
                    </>
                  ) : (
                    <span className={`text-xs px-3 py-1 rounded-full border font-medium ${DR_STATUS_COLORS[reg.status]}`}>
                      {DR_STATUS_LABELS[reg.status]}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
