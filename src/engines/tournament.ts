/**
 * BOCCE TOURNAMENT ENGINE
 * Implements the specific double-elimination group system used at Postojna Open
 * and similar Slovenian bocce tournaments.
 *
 * Group formats:
 *  - 3 teams: 5 matches, 2 byes, 2 qualify
 *  - 4 teams: 5 matches, no byes, 2 qualify
 *  - 5 teams: 9 matches, 2 byes, 2 qualify
 *
 * Match type codes:
 *  zm = zmagovalci (winners bracket)
 *  po = poraženci (losers bracket)
 *  r  = revanša / repechage (last-chance)
 *  bye = prosta (walkover, auto-win 6:0)
 */

import type {
  MatchType, MatchStage, GroupSize, TeamDescriptor, MatchTemplate,
  MatchResultEntry, GroupMatch, KnockoutBracketResult, KnockoutMatchEntry,
  GroupQualifier, TournamentRegistration, GroupDistribution,
} from '../types'

export const BYE_SCORE = 6

// ────────────────────────────────────────────────────────────────
// GROUP MATCH TEMPLATES
// ────────────────────────────────────────────────────────────────
export const GROUP_TEMPLATES: Record<GroupSize, MatchTemplate[]> = {
  3: [
    { num: 1, type: 'zm',  teamA: { seed: 0 },        teamB: { seed: 1 }        },
    { num: 2, type: 'bye', teamA: { seed: 2 },        teamB: 'BYE'              },
    { num: 3, type: 'zm',  teamA: { winsMatch: 1 },   teamB: { winsMatch: 2 }   },
    { num: 4, type: 'po',  teamA: { losesMatch: 1 },  teamB: 'BYE'              },
    { num: 5, type: 'r',   teamA: { losesMatch: 3 },  teamB: { winsMatch: 4 }   },
  ],
  4: [
    { num: 1, type: 'zm',  teamA: { seed: 0 },        teamB: { seed: 3 }        },
    { num: 2, type: 'zm',  teamA: { seed: 1 },        teamB: { seed: 2 }        },
    { num: 3, type: 'zm',  teamA: { winsMatch: 1 },   teamB: { winsMatch: 2 }   },
    { num: 4, type: 'po',  teamA: { losesMatch: 1 },  teamB: { losesMatch: 2 }  },
    { num: 5, type: 'r',   teamA: { losesMatch: 3 },  teamB: { winsMatch: 4 }   },
  ],
  5: [
    { num: 1, type: 'zm',  teamA: { seed: 0 },        teamB: { seed: 3 }        },
    { num: 2, type: 'zm',  teamA: { seed: 1 },        teamB: { seed: 2 }        },
    { num: 3, type: 'bye', teamA: { seed: 4 },        teamB: 'BYE'              },
    { num: 4, type: 'zm',  teamA: { winsMatch: 2 },   teamB: { winsMatch: 3 }   },
    { num: 5, type: 'po',  teamA: { losesMatch: 1 },  teamB: { losesMatch: 2 }  },
    { num: 6, type: 'bye', teamA: { winsMatch: 1 },   teamB: 'BYE'              },
    { num: 7, type: 'zm',  teamA: { winsMatch: 4 },   teamB: { winsMatch: 6 }   },
    { num: 8, type: 'po',  teamA: { losesMatch: 4 },  teamB: { winsMatch: 5 }   },
    { num: 9, type: 'r',   teamA: { losesMatch: 7 },  teamB: { winsMatch: 8 }   },
  ],
}

export const GROUP_QUALIFIERS: Record<GroupSize, Record<1 | 2, { winsMatch: number }>> = {
  3: { 1: { winsMatch: 3 }, 2: { winsMatch: 5 } },
  4: { 1: { winsMatch: 3 }, 2: { winsMatch: 5 } },
  5: { 1: { winsMatch: 7 }, 2: { winsMatch: 9 } },
}

// ────────────────────────────────────────────────────────────────
// RESOLVE TEAM FOR A MATCH SLOT
// ────────────────────────────────────────────────────────────────
export function resolveSlot<T>(
  descriptor: TeamDescriptor,
  teams: T[],
  matchResults: Record<number, MatchResultEntry<T>>,
): T | null {
  if (descriptor === 'BYE') return null
  if ('seed' in descriptor) return teams[descriptor.seed] ?? null

  const matchNum = 'winsMatch' in descriptor ? descriptor.winsMatch : descriptor.losesMatch
  const result = matchResults[matchNum]
  if (!result) return null

  if ('winsMatch' in descriptor) return result.winner
  return result.loser
}

// ────────────────────────────────────────────────────────────────
// BUILD INITIAL MATCH SCHEDULE FOR A GROUP
// ────────────────────────────────────────────────────────────────
export function buildGroupSchedule<T>(groupSize: GroupSize, teams: T[]): GroupMatch<T>[] {
  const template = GROUP_TEMPLATES[groupSize]
  if (!template) throw new Error(`Neznan format skupine: ${groupSize}`)

  const matchResults: Record<number, MatchResultEntry<T>> = {}
  const matches: GroupMatch<T>[] = []

  for (const tpl of template) {
    const teamA = resolveSlot(tpl.teamA, teams, matchResults)
    const teamB = resolveSlot(tpl.teamB, teams, matchResults)
    const isBye = tpl.teamB === 'BYE' || tpl.type === 'bye'

    const match: GroupMatch<T> = {
      num: tpl.num,
      type: tpl.type,
      teamA,
      teamB,
      isBye,
      scoreA: isBye ? BYE_SCORE : null,
      scoreB: isBye ? 0 : null,
      winner: isBye && teamA ? teamA : null,
      loser: null,
      played: isBye && teamA !== null,
      depA: tpl.teamA,
      depB: tpl.teamB,
    }

    if (match.played) {
      matchResults[tpl.num] = { winner: match.winner, loser: match.loser }
    }

    matches.push(match)
  }

  return matches
}

// ────────────────────────────────────────────────────────────────
// ENTER A SCORE AND PROPAGATE RESULTS
// ────────────────────────────────────────────────────────────────
export function applyScore<T>(
  matches: GroupMatch<T>[],
  matchNum: number,
  scoreA: number,
  scoreB: number,
  teams: T[] = [],
): GroupMatch<T>[] {
  const updated = matches.map(m => ({ ...m }))
  const idx = updated.findIndex(m => m.num === matchNum)
  if (idx === -1) throw new Error(`Tekma ${matchNum} ne obstaja`)

  const m = updated[idx]
  if (m.isBye) throw new Error('Tekme s prostim žrebom ni mogoče urejati')
  if (scoreA === scoreB) throw new Error('Izenačen rezultat ni dovoljen v bocce')

  m.scoreA = scoreA
  m.scoreB = scoreB
  m.played = true
  m.winner = scoreA > scoreB ? m.teamA : m.teamB
  m.loser  = scoreA > scoreB ? m.teamB : m.teamA

  const results: Record<number, MatchResultEntry<T>> = {}
  for (const match of updated) {
    if (match.played) {
      results[match.num] = { winner: match.winner, loser: match.loser }
    }
  }

  for (const match of updated) {
    if (!match.played) {
      const resolvedA = resolveSlot(match.depA, teams, results)
      const resolvedB = resolveSlot(match.depB, teams, results)
      if (resolvedA !== null) match.teamA = resolvedA
      if (resolvedB !== null) match.teamB = resolvedB
    }
  }

  return updated
}

// ────────────────────────────────────────────────────────────────
// GET GROUP QUALIFIERS FROM COMPLETED MATCHES
// ────────────────────────────────────────────────────────────────
export function getGroupQualifiers<T>(
  matches: GroupMatch<T>[],
  groupSize: GroupSize,
): Record<string, T | null> {
  const qualDef = GROUP_QUALIFIERS[groupSize]
  const results: Record<number, MatchResultEntry<T>> = {}
  for (const m of matches) {
    if (m.played) results[m.num] = { winner: m.winner, loser: m.loser }
  }

  const out: Record<string, T | null> = {}
  for (const [pos, dep] of Object.entries(qualDef)) {
    const r = results[dep.winsMatch]
    out[pos] = r?.winner ?? null
  }
  return out
}

// ────────────────────────────────────────────────────────────────
// KNOCKOUT BRACKET BUILDER
// ────────────────────────────────────────────────────────────────
export function buildKnockoutBracket(groupQualifiers: GroupQualifier[]): KnockoutBracketResult {
  const pos1 = groupQualifiers.filter(q => q.position === 1).sort((a, b) => a.groupNumber - b.groupNumber)
  const pos2 = groupQualifiers.filter(q => q.position === 2).sort((a, b) => a.groupNumber - b.groupNumber)

  const n = pos1.length
  const bracket: Array<{ teamA: GroupQualifier['team']; teamB: GroupQualifier['team'] }> = []

  for (let i = 0; i < Math.floor(n / 2); i++) {
    const j = n - 1 - i
    bracket.push({ teamA: pos1[i]?.team ?? null, teamB: pos2[j]?.team ?? null })
    bracket.push({ teamA: pos2[i]?.team ?? null, teamB: pos1[j]?.team ?? null })
  }

  const firstStage: MatchStage = bracket.length > 8 ? 'r16' : bracket.length > 4 ? 'qf' : 'sf'

  const knockoutMatches: KnockoutMatchEntry[] = bracket.map((pair, i) => ({
    stage: firstStage,
    matchNumber: i + 1,
    teamA: pair.teamA,
    teamB: pair.teamB,
    scoreA: null, scoreB: null, winner: null, played: false,
  }))

  return { firstStage, matches: knockoutMatches, totalTeams: bracket.length }
}

// ────────────────────────────────────────────────────────────────
// KNOCKOUT STAGE PROGRESSION
// ────────────────────────────────────────────────────────────────
export function nextKnockoutStage(
  currentStage: MatchStage,
  currentMatches: KnockoutMatchEntry[],
): { stage: MatchStage; matches: KnockoutMatchEntry[] } | null {
  const stageOrder: MatchStage[] = ['r64', 'r32', 'r16', 'qf', 'sf', 'final']
  const idx = stageOrder.indexOf(currentStage)
  if (idx === -1 || idx === stageOrder.length - 1) return null

  const nextStage = stageOrder[idx + 1]
  const winners = currentMatches
    .sort((a, b) => a.matchNumber - b.matchNumber)
    .map(m => m.winner)

  const matches: KnockoutMatchEntry[] = []
  for (let i = 0; i < winners.length; i += 2) {
    matches.push({
      stage: nextStage,
      matchNumber: Math.floor(i / 2) + 1,
      teamA: winners[i] ?? null,
      teamB: winners[i + 1] ?? null,
      scoreA: null, scoreB: null, winner: null, played: false,
    })
  }

  if (currentStage === 'sf') {
    const sfLosers = currentMatches.map(m => m.loser ?? null)
    matches.push({
      stage: 'third_place',
      matchNumber: 1,
      teamA: sfLosers[0] ?? null,
      teamB: sfLosers[1] ?? null,
      scoreA: null, scoreB: null, winner: null, played: false,
    })
  }

  return { stage: nextStage, matches }
}

// ────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────
export function teamDisplayName(registration: TournamentRegistration | null | undefined): string {
  if (!registration) return '???'
  const p1 = registration.player1?.full_name?.split(' ').at(-1) ?? '?'
  const p2 = registration.player2?.full_name?.split(' ').at(-1) ?? '?'
  return `${p1} / ${p2}`
}

export function matchTypeLabel(type: MatchType): string {
  const labels: Record<MatchType, string> = {
    zm: 'Zmagovalci', po: 'Poraženci', r: 'Repasaž', bye: 'Prosta', knockout: 'Izločilni',
  }
  return labels[type] ?? type
}

export function stageLabel(stage: string): string {
  const labels: Record<string, string> = {
    group: 'Skupinski del', r64: '1/32 finala', r32: '1/16 finala',
    r16: '1/8 finala', qf: 'Četrtfinale',
    sf: 'Polfinale', final: 'Finale', third_place: 'Za 3. mesto',
  }
  return labels[stage] ?? stage
}

// ────────────────────────────────────────────────────────────────
// GROUP DISTRIBUTION ALGORITHM
// ────────────────────────────────────────────────────────────────
function floorPow2(n: number): number {
  return Math.pow(2, Math.floor(Math.log2(Math.max(n, 1))))
}

const TARGET_TO_STAGE: Record<number, MatchStage> = {
  4: 'sf', 8: 'qf', 16: 'r16', 32: 'r32', 64: 'r64',
}
const PREV_STAGE: Partial<Record<MatchStage, MatchStage>> = {
  sf: 'qf', qf: 'r16', r16: 'r32', r32: 'r64',
}

export function suggestGroupDistribution(numTeams: number, forceGroups?: number): GroupDistribution {
  // Step 1: number of groups from team count (or manual override)
  let G: number
  if (forceGroups && forceGroups > 0) {
    G = forceGroups
  } else if (numTeams <= 10)      G = 2
  else if (numTeams === 11) G = 3
  else if (numTeams <= 20) G = 4
  else if (numTeams <= 23) G = 6
  else if (numTeams <= 40) G = 8
  else if (numTeams <= 47) G = 12
  else if (numTeams <= 80) G = 16
  else if (numTeams <= 95) G = 24
  else                     G = 32

  // Step 2: extra vs direct groups
  const fp2 = floorPow2(G)
  const target = 2 * fp2
  const G_extra = 2 * G - target   // groups of 3 (play extra knockout round)
  const G_direct = G - G_extra     // groups of 4/5 (go directly)

  // Step 3: distribute teams among direct groups (sizes 4 or 5)
  // G5*5 + G4*4 = teamsInDirect  →  G5 = teamsInDirect - 4*G_direct
  const teamsInExtra = 3 * G_extra
  const teamsInDirect = numTeams - teamsInExtra
  let G5 = 0
  let G4 = G_direct
  if (G_direct > 0) {
    G5 = teamsInDirect - 4 * G_direct  // fixed: was teamsInDirect % G_direct
    G4 = G_direct - G5
  }

  // Step 4: stages
  const directStage = TARGET_TO_STAGE[target] ?? 'r16'
  const extraStage = G_extra > 0 ? (PREV_STAGE[directStage] ?? null) : null

  return {
    totalGroups: G,
    groups3: G_extra,
    groups4: G4,
    groups5: G5,
    extraRoundGroups: G_extra,
    directGroups: G_direct,
    targetKnockout: target,
    directStage,
    extraStage,
  }
}
