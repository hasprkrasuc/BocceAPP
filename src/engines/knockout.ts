import type { MatchStage } from '../types'

/** Vrstni red izločilnih krogov (od največjega do finala). */
export const KO_STAGE_ORDER: MatchStage[] = ['r128', 'r64', 'r32', 'r16', 'qf', 'sf', 'final']

const SIZE_STAGE: Record<number, MatchStage> = {
  128: 'r128', 64: 'r64', 32: 'r32', 16: 'r16', 8: 'qf', 4: 'sf', 2: 'final',
}

/** Velikost mreže: najbližja potenca 2 ≥ n, omejeno na [2, 128]. */
export function bracketSize(n: number): number {
  if (n < 2) throw new Error('Premalo prijav za izločilni žreb (najmanj 2)')
  if (n > 128) throw new Error('Preveč prijav za izločilni žreb (največ 128)')
  let b = 2
  while (b < n) b *= 2
  return b
}

/** Ime prvega kroga glede na velikost mreže B. */
export function firstStageForSize(b: number): MatchStage {
  const s = SIZE_STAGE[b]
  if (!s) throw new Error(`Neveljavna velikost mreže: ${b}`)
  return s
}

/** Standardni nosilni razpored: vrne nosilne številke (1..B) po mestih mreže. */
export function seedOrder(b: number): number[] {
  let rounds = [1, 2]
  while (rounds.length < b) {
    const n = rounds.length * 2
    const next: number[] = []
    for (const s of rounds) {
      next.push(s)
      next.push(n + 1 - s)
    }
    rounds = next
  }
  return rounds
}

export interface PlannedMatch {
  stage: MatchStage
  matchNumber: number
  teamA: string | null
  teamB: string | null
  isBye: boolean
  winner: string | null
}

/**
 * Zgradi CELOTNO izločilno mrežo iz eksplicitnih parov prvega kroga.
 * Vsak par = [ekipa A, ekipa B]; ena stran NULL pomeni prosto (bye).
 * Število parov mora dati mrežo velikosti potence 2 (2..128).
 */
export function buildBracketFromFirstRound(pairs: Array<[string | null, string | null]>): PlannedMatch[] {
  const half = pairs.length
  if (half < 1) throw new Error('Prazna izločilna mreža')
  const b = half * 2
  if ((b & (b - 1)) !== 0) throw new Error('Neveljavno število parov (mreža mora biti potenca 2)')
  if (b > 128) throw new Error('Preveč ekip za izločilni del (največ 128)')

  const stages = KO_STAGE_ORDER.slice(KO_STAGE_ORDER.indexOf(firstStageForSize(b)))
  const matches: PlannedMatch[] = []

  // Prvi krog — iz podanih parov
  const firstStage = stages[0]
  pairs.forEach(([a, c], i) => {
    let teamA = a, teamB = c, isBye = false, winner: string | null = null
    if (a && !c) { teamA = a; teamB = null; isBye = true; winner = a }
    else if (!a && c) { teamA = c; teamB = null; isBye = true; winner = c }
    matches.push({ stage: firstStage, matchNumber: i + 1, teamA, teamB, isBye, winner })
  })

  // Nadaljnji krogi (prazni)
  for (let s = 1; s < stages.length; s++) {
    const count = b / Math.pow(2, s + 1)
    for (let i = 0; i < count; i++) {
      matches.push({ stage: stages[s], matchNumber: i + 1, teamA: null, teamB: null, isBye: false, winner: null })
    }
  }

  // Tekma za 3. mesto (če obstaja polfinale)
  if (b >= 4) {
    matches.push({ stage: 'third_place', matchNumber: 1, teamA: null, teamB: null, isBye: false, winner: null })
  }

  return matches
}

/** Standardni nosilni pari prvega kroga iz nosilno urejenih ekip (indeks 0 = nosilec 1). */
export function pairsFromSeededTeams(seededTeamIds: string[]): Array<[string | null, string | null]> {
  const b = bracketSize(seededTeamIds.length)
  const order = seedOrder(b)
  const slotTeam = (slot: number): string | null => seededTeamIds[order[slot] - 1] ?? null
  const pairs: Array<[string | null, string | null]> = []
  for (let i = 0; i < b / 2; i++) pairs.push([slotTeam(2 * i), slotTeam(2 * i + 1)])
  return pairs
}

/** Zgradi celotno izločilno mrežo iz nosilno urejenih ekip (indeks 0 = nosilec 1). */
export function buildKnockoutBracket(seededTeamIds: string[]): PlannedMatch[] {
  return buildBracketFromFirstRound(pairsFromSeededTeams(seededTeamIds))
}

export interface KoMatchRow {
  id: string
  stage: MatchStage
  match_number: number
  team_a_id: string | null
  team_b_id: string | null
  winner_id: string | null
  is_bye: boolean
}

export interface KoSlotUpdate {
  id: string
  slot: 'team_a_id' | 'team_b_id'
  teamId: string
}

/** Izračuna, katera mesta naslednjih krogov je treba napolniti iz zmagovalcev. */
export function knockoutPropagation(matches: KoMatchRow[]): KoSlotUpdate[] {
  const koStages = KO_STAGE_ORDER.filter(s => matches.some(m => m.stage === s))
  if (koStages.length) {
    const expected = KO_STAGE_ORDER.slice(KO_STAGE_ORDER.indexOf(koStages[0]))
    const contiguous = koStages.every((s, i) => s === expected[i])
    if (!contiguous) throw new Error('Nepravilna izločilna mreža: manjka vmesni krog')
  }
  const byStage = (s: MatchStage) =>
    matches.filter(m => m.stage === s).sort((a, b) => a.match_number - b.match_number)

  const updates: KoSlotUpdate[] = []
  const want = (target: KoMatchRow | undefined, slot: KoSlotUpdate['slot'], teamId: string) => {
    if (!target) return
    const cur = slot === 'team_a_id' ? target.team_a_id : target.team_b_id
    if (cur !== teamId) updates.push({ id: target.id, slot, teamId })
  }

  for (let si = 0; si < koStages.length - 1; si++) {
    const cur = byStage(koStages[si])
    const nxt = byStage(koStages[si + 1])
    cur.forEach((m, j) => {
      if (!m.winner_id) return
      want(nxt[Math.floor(j / 2)], j % 2 === 0 ? 'team_a_id' : 'team_b_id', m.winner_id)
    })
  }

  const third = byStage('third_place')[0]
  if (third) {
    byStage('sf').forEach((m, j) => {
      if (!m.winner_id) return
      const loser = m.winner_id === m.team_a_id ? m.team_b_id : m.team_a_id
      if (loser) want(third, j % 2 === 0 ? 'team_a_id' : 'team_b_id', loser)
    })
  }

  return updates
}

export interface SeedableReg {
  id: string
  /** NULL za gosta (neregistriran/tuji igralec) — brez rang točk. */
  player1_id: string | null
  player2_id: string | null
}

/** Razvrsti prijave po nosilni vrednosti (vsota rang točk ekipe), padajoče. */
export function seedRegistrations(regs: SeedableReg[], rangPoints: Record<string, number>): string[] {
  const val = (r: SeedableReg) =>
    (r.player1_id ? rangPoints[r.player1_id] ?? 0 : 0) + (r.player2_id ? rangPoints[r.player2_id] ?? 0 : 0)
  return [...regs]
    .sort((a, b) => (val(b) - val(a)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(r => r.id)
}
