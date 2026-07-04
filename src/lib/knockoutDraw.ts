import { supabase } from '../supabase'
import {
  bracketSize, buildKnockoutBracket, knockoutPropagation, seedRegistrations,
  type KoMatchRow, type SeedableReg,
} from '../engines/knockout'

/** Prebere izločilne tekme turnirja, napolni mesta naslednjih krogov iz zmagovalcev. */
export async function propagateKnockout(tournamentId: string): Promise<void> {
  const { data } = await supabase
    .from('matches')
    .select('id, stage, match_number, team_a_id, team_b_id, winner_id, is_bye')
    .eq('tournament_id', tournamentId)
    .neq('stage', 'group')
  const rows = (data ?? []) as KoMatchRow[]
  const updates = knockoutPropagation(rows)
  for (const u of updates) {
    await supabase.from('matches').update({ [u.slot]: u.teamId }).eq('id', u.id)
  }
}

/** Naredi (ali ponovi) direktni izločilni žreb: nosilci → mreža → tekme. */
export async function drawKnockout(
  tournamentId: string,
  confirmedRegs: SeedableReg[],
  rangPoints: Record<string, number>,
): Promise<{ bracket: number; teams: number }> {
  const n = confirmedRegs.length
  const b = bracketSize(n) // vrže napako pri <2 ali >128

  // 1. Počisti obstoječo mrežo (tekme + kontejnerske skupine)
  await supabase.from('matches').delete().eq('tournament_id', tournamentId)
  const { data: oldGroups } = await supabase
    .from('tournament_groups').select('id').eq('tournament_id', tournamentId)
  const oldIds = (oldGroups ?? []).map(g => g.id)
  if (oldIds.length) await supabase.from('group_teams').delete().in('group_id', oldIds)
  await supabase.from('tournament_groups').delete().eq('tournament_id', tournamentId)

  // 2. Kontejnerska skupina
  const { data: grp, error: gErr } = await supabase
    .from('tournament_groups')
    .insert({ tournament_id: tournamentId, group_number: 1, status: 'pending' })
    .select('id').single()
  if (gErr) throw gErr

  // 3. Nosilci → group_teams (seed = mesto)
  const orderedRegIds = seedRegistrations(confirmedRegs, rangPoints)
  const { data: gts, error: gtErr } = await supabase
    .from('group_teams')
    .insert(orderedRegIds.map((regId, i) => ({ group_id: grp.id, registration_id: regId, seed: i + 1 })))
    .select('id, registration_id, seed')
  if (gtErr) throw gtErr
  const gtBySeed = new Map((gts ?? []).map(g => [g.seed, g.id]))
  const seededTeamIds = orderedRegIds.map((_, i) => gtBySeed.get(i + 1)!)

  // 4. Zgradi mrežo → vpiši tekme
  const planned = buildKnockoutBracket(seededTeamIds)
  const rows = planned.map(p => ({
    tournament_id: tournamentId,
    group_id: null,
    stage: p.stage,
    match_type: p.isBye ? 'bye' : 'knockout',
    match_number: p.matchNumber,
    team_a_id: p.teamA,
    team_b_id: p.teamB,
    winner_id: p.winner,
    score_a: p.isBye ? 6 : null,
    score_b: p.isBye ? 0 : null,
    is_bye: p.isBye,
    status: p.winner ? 'completed' : 'pending',
  }))
  const { error: mErr } = await supabase.from('matches').insert(rows)
  if (mErr) throw mErr

  // 5. Razreši bye naprej
  await propagateKnockout(tournamentId)

  return { bracket: b, teams: n }
}
