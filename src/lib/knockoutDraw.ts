import { supabase } from '../supabase'
import {
  bracketSize, buildKnockoutBracket, buildBracketFromFirstRound, knockoutPropagation,
  seedRegistrations, type KoMatchRow, type SeedableReg,
} from '../engines/knockout'

/**
 * Prebere izločilne tekme turnirja, napolni mesta naslednjih krogov iz zmagovalcev.
 * Deluje za oba formata (čisti izločilni IN skupine→izločilni) — obravnava le
 * izločilne kroge (stage != 'group'), skupinskih tekem se ne dotakne.
 *
 * Popravek izida že propagirane tekme ZAMENJA ekipo v naslednjem krogu
 * (knockoutPropagation vrne tudi zastarela mesta). Če je bila naslednja tekma
 * s staro ekipo že odigrana, njen izid ne velja več — ponastavi se na
 * neodigrano; nova propagacija steče, ko se izid vnese znova.
 */
export async function propagateKnockout(tournamentId: string): Promise<void> {
  const { data } = await supabase
    .from('matches')
    .select('id, stage, match_number, team_a_id, team_b_id, winner_id, is_bye, status')
    .eq('tournament_id', tournamentId)
    .neq('stage', 'group')
  const rows = (data ?? []) as Array<KoMatchRow & { status: string }>
  if (rows.length === 0) return
  // Zanka: zamenjava ekipe lahko ponastavi že odigrano tekmo in s tem sprosti
  // nove uskladitve. Krogov je največ osem, zato trda meja passov.
  for (let obhod = 0; obhod < 10; obhod++) {
    const updates = knockoutPropagation(rows)
    if (updates.length === 0) break
    for (const u of updates) {
      const row = rows.find(r => r.id === u.id)
      if (!row) continue
      const zamenjava = (u.slot === 'team_a_id' ? row.team_a_id : row.team_b_id) !== null
      const patch: Record<string, unknown> = { [u.slot]: u.teamId }
      if (zamenjava && !row.is_bye && row.winner_id) {
        patch.winner_id = null
        patch.score_a = null
        patch.score_b = null
        patch.status = 'pending'
      }
      const { error } = await supabase.from('matches').update(patch).eq('id', u.id)
      if (error) throw error
      Object.assign(row, patch)
    }
  }
}

/**
 * Vstavi celotno izločilno mrežo iz eksplicitnih parov prvega kroga (team id =
 * group_teams.id). Počisti obstoječe izločilne tekme (NE skupinskih), vstavi
 * mrežo in razreši morebitne bye naprej. Uporabljata jo samodejni, žrebni in
 * ročni način — za oba formata turnirja.
 */
export async function insertKnockoutBracket(
  tournamentId: string,
  pairs: Array<[string | null, string | null]>,
  opts: { thirdPlace?: boolean } = {},
): Promise<void> {
  const planned = buildBracketFromFirstRound(pairs, opts)
  await supabase.from('matches').delete().eq('tournament_id', tournamentId).neq('stage', 'group')
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
  const { error } = await supabase.from('matches').insert(rows)
  if (error) throw error
  await propagateKnockout(tournamentId)
}

/** Naredi (ali ponovi) direktni izločilni žreb: nosilci → mreža → tekme. */
export async function drawKnockout(
  tournamentId: string,
  confirmedRegs: SeedableReg[],
  rangPoints: Record<string, number>,
  opts: { thirdPlace?: boolean } = {},
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
  const planned = buildKnockoutBracket(seededTeamIds, opts)
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
