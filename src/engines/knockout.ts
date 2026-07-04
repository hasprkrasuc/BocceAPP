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

/** Zgradi celotno izločilno mrežo iz nosilno urejenih ekip (indeks 0 = nosilec 1). */
export function buildKnockoutBracket(seededTeamIds: string[]): PlannedMatch[] {
  const n = seededTeamIds.length
  const b = bracketSize(n)
  const order = seedOrder(b)
  const slotTeam = (slot: number): string | null => seededTeamIds[order[slot] - 1] ?? null

  const stages = KO_STAGE_ORDER.slice(KO_STAGE_ORDER.indexOf(firstStageForSize(b)))
  const matches: PlannedMatch[] = []

  // Prvi krog
  const firstStage = stages[0]
  for (let i = 0; i < b / 2; i++) {
    const a = slotTeam(2 * i)
    const c = slotTeam(2 * i + 1)
    let teamA = a, teamB = c, isBye = false, winner: string | null = null
    if (a && !c) { teamA = a; teamB = null; isBye = true; winner = a }
    else if (!a && c) { teamA = c; teamB = null; isBye = true; winner = c }
    matches.push({ stage: firstStage, matchNumber: i + 1, teamA, teamB, isBye, winner })
  }

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
