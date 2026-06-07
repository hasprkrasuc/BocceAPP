/**
 * ADMIN — Dvojne registracije
 * Admin direktno dodeli/odvzame dvojno registracijo.
 * Ni workflow (vloge, odobritve) — admin določi, sistem zabeleži.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabase'
import type { DoubleRegistration } from '../../types'
import { DR_TIER_LABELS } from '../../engines/doubleRegistration'

export default function DoubleRegAdmin() {
  const [regs, setRegs] = useState<DoubleRegistration[]>([])
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('double_registrations')
      .select(`
        *,
        player:users(id, full_name, club, date_of_birth),
        primary_team:league_teams!primary_team_id(id, club_name, season:league_seasons(name, tier)),
        secondary_team:league_teams!secondary_team_id(id, club_name, season:league_seasons(name, tier))
      `)
      .eq('status', 'approved')
      .order('requested_at', { ascending: false })

    setRegs((data ?? []) as DoubleRegistration[])
    setLoading(false)
  }

  async function remove(reg: DoubleRegistration) {
    if (!confirm(`Odstranis dvojno registracijo za ${reg.player?.full_name}?`)) return
    setRemoving(reg.id)
    // Odstrani iz sekundarnega rosterja
    await supabase.from('league_team_players')
      .delete()
      .eq('league_team_id', reg.secondary_team_id)
      .eq('player_id', reg.player_id)
    // Zbriši zapis
    await supabase.from('double_registrations').delete().eq('id', reg.id)
    setRemoving(null)
    load()
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dvojne registracije</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Za dodelitev pojdi na profil igralca → sekcija "Dvojna registracija"
          </p>
        </div>
        <span className="text-sm text-gray-400">{regs.length} aktivnih</span>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : regs.length === 0 ? (
        <div className="text-center py-16 text-gray-400 italic bg-white border border-gray-200 rounded-2xl">
          Ni aktivnih dvojnih registracij.<br />
          <span className="text-sm">Dodeli jih prek profila posameznega igralca.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {regs.map(reg => (
            <div key={reg.id} className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-4 flex-wrap">
              {/* Ime */}
              <Link to={`/igraci/${reg.player_id}`}
                className="font-semibold text-gray-800 hover:text-bocce-green min-w-[160px]">
                {reg.player?.full_name}
              </Link>

              {/* Kluba */}
              <div className="flex items-center gap-2 flex-1 text-sm">
                <span className="bg-bocce-green/10 text-bocce-green px-2 py-0.5 rounded font-medium">
                  {(reg.primary_team as any)?.club_name}
                  <span className="text-xs opacity-60 ml-1">
                    ({DR_TIER_LABELS[(reg.primary_team as any)?.season?.tier ?? ''] ?? '—'})
                  </span>
                </span>
                <span className="text-gray-400 font-bold">⇄</span>
                <span className="bg-bocce-gold/10 text-yellow-700 px-2 py-0.5 rounded font-medium">
                  {(reg.secondary_team as any)?.club_name}
                  <span className="text-xs opacity-60 ml-1">
                    ({DR_TIER_LABELS[(reg.secondary_team as any)?.season?.tier ?? ''] ?? '—'})
                  </span>
                </span>
              </div>

              {/* Datum */}
              <span className="text-xs text-gray-400 shrink-0">
                {reg.resolved_at ? new Date(reg.resolved_at).toLocaleDateString('sl-SI') : '—'}
              </span>

              {/* Odstrani */}
              <button
                onClick={() => remove(reg)}
                disabled={removing === reg.id}
                className="text-xs border border-red-200 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40 shrink-0"
              >
                {removing === reg.id ? '...' : 'Odstrani'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
