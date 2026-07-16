import { supabase } from '../supabase'
import type { UserProfile } from '../types'

/**
 * Igralci, izbirljivi na turnirjih.
 *
 * = vsi z vlogo `player` PLUS člani ligaških postav, ki imajo drugo primarno
 * vlogo (sodniki/admini, ki tudi igrajo). Slednji bi sicer manjkali, ker
 * seznam filtrira `role = 'player'` — npr. igralec-sodnik ali igralec, ki je
 * hkrati administrator kluba.
 *
 * PostgREST privzeto vrne največ 1000 vrstic, zato registrirane igralce beremo
 * po straneh. Rezultat je urejen po imenu.
 */
export async function loadTournamentPlayers(
  columns = 'id, full_name, club, club_id, date_of_birth',
): Promise<UserProfile[]> {
  const pageSize = 1000
  const all: UserProfile[] = []

  // 1) Vsi z vlogo 'player' (po straneh).
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('users')
      .select(columns)
      .eq('role', 'player')
      .order('full_name')
      .range(from, from + pageSize - 1)
    if (error) break
    const batch = (data ?? []) as unknown as UserProfile[]
    all.push(...batch)
    if (batch.length < pageSize) break
  }

  // 2) Člani ligaških postav, ki jih 1) ne zajame (druga primarna vloga).
  const { data: rosterRows } = await supabase.from('league_team_players').select('player_id')
  const have = new Set(all.map(p => p.id))
  const missing = [...new Set(((rosterRows ?? []) as Array<{ player_id: string }>).map(r => r.player_id))]
    .filter(id => id && !have.has(id))
  for (let i = 0; i < missing.length; i += 300) {
    const { data } = await supabase
      .from('users')
      .select(columns)
      .in('id', missing.slice(i, i + 300))
    all.push(...((data ?? []) as unknown as UserProfile[]))
  }

  all.sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'sl'))
  return all
}
