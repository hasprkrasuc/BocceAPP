import { supabase } from '../supabase'
import { tournamentPlayerPoints } from '../engines/tournamentPlacement'
import { seriesStandings, type SeriesPlayerResult } from '../engines/tournamentSeries'
import type { TournamentSeries } from '../types'

export interface SeriesStandingRow extends SeriesPlayerResult {
  full_name: string | null
}

/** Izračuna lestvico serije iz vseh ZAKLJUČENIH turnirjev v njej. */
export async function loadSeriesStandings(series: TournamentSeries): Promise<SeriesStandingRow[]> {
  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id')
    .eq('series_id', series.id)
    .eq('status', 'completed')

  const perTournament: { player_id: string; points: number }[] = []

  for (const t of tournaments ?? []) {
    const [{ data: regs }, { data: groups }, { data: matches }] = await Promise.all([
      supabase.from('tournament_registrations')
        .select('id, player1_id, player2_id')
        .eq('tournament_id', t.id).eq('status', 'confirmed'),
      supabase.from('tournament_groups')
        .select('id, group_teams(id, registration_id)')
        .eq('tournament_id', t.id),
      supabase.from('matches')
        .select('stage, team_a_id, team_b_id, winner_id')
        .eq('tournament_id', t.id).neq('stage', 'group').eq('status', 'completed'),
    ])

    const groupTeams = (groups ?? []).flatMap(g =>
      (g.group_teams ?? []).map((gt: { id: string; registration_id: string }) => gt))

    const pts = tournamentPlayerPoints({
      registrations: regs ?? [],
      groupTeams,
      knockoutMatches: matches ?? [],
    })
    perTournament.push(...pts.map(p => ({ player_id: p.player_id, points: p.points })))
  }

  const standings = seriesStandings(perTournament, series.counting_results)

  // pridruži imena
  const ids = standings.map(s => s.player_id)
  const { data: users } = ids.length
    ? await supabase.from('users').select('id, full_name').in('id', ids)
    : { data: [] as { id: string; full_name: string | null }[] }
  const nameById = new Map((users ?? []).map(u => [u.id, u.full_name]))

  return standings.map(s => ({ ...s, full_name: nameById.get(s.player_id) ?? null }))
}
