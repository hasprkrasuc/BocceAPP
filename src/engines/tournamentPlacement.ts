import type { DisciplineType } from '../types'

export const PLACEMENT_POINTS = { p1: 16, p2: 10, p3: 8, p4: 7, p5_8: 3, p9_16: 1 } as const

export type PlacementBucket = 1 | 2 | 3 | 4 | '5-8' | '9-16'

export interface PlacementInput {
  registrations: {
    id: string
    player1_id: string | null
    player2_id: string | null
    // Gost-igralec (guest_players) ima svoj stabilen UUID — šteje v lestvico serije.
    player1_guest_id?: string | null
    player2_guest_id?: string | null
  }[]
  groupTeams: { id: string; registration_id: string }[]
  knockoutMatches: {
    stage: string
    team_a_id: string | null
    team_b_id: string | null
    winner_id: string | null
  }[]
}

export interface PlayerPoints {
  player_id: string
  points: number
  bucket: PlacementBucket
}

const PAIR_DISCIPLINES: ReadonlySet<DisciplineType> = new Set(['dvojka', 'stafeta'])

export function isPairDiscipline(d: DisciplineType): boolean {
  return PAIR_DISCIPLINES.has(d)
}

export function bucketPoints(bucket: PlacementBucket): number {
  switch (bucket) {
    case 1: return PLACEMENT_POINTS.p1
    case 2: return PLACEMENT_POINTS.p2
    case 3: return PLACEMENT_POINTS.p3
    case 4: return PLACEMENT_POINTS.p4
    case '5-8': return PLACEMENT_POINTS.p5_8
    case '9-16': return PLACEMENT_POINTS.p9_16
  }
}

export function tournamentPlayerPoints(input: PlacementInput): PlayerPoints[] {
  const { registrations, groupTeams, knockoutMatches } = input
  const regOfGt = new Map(groupTeams.map(gt => [gt.id, gt.registration_id]))
  const loserGt = (m: PlacementInput['knockoutMatches'][number]): string | null => {
    if (!m.winner_id) return null
    return m.winner_id === m.team_a_id ? m.team_b_id : m.team_a_id
  }

  const bucketByReg = new Map<string, PlacementBucket>()
  const assign = (regId: string | undefined, b: PlacementBucket) => {
    if (regId && !bucketByReg.has(regId)) bucketByReg.set(regId, b)
  }

  const final = knockoutMatches.find(m => m.stage === 'final' && m.winner_id)
  if (final) {
    assign(regOfGt.get(final.winner_id!), 1)
    assign(regOfGt.get(loserGt(final)!), 2)
  }
  const third = knockoutMatches.find(m => m.stage === 'third_place' && m.winner_id)
  if (third) {
    assign(regOfGt.get(third.winner_id!), 3)
    assign(regOfGt.get(loserGt(third)!), 4)
  }
  for (const m of knockoutMatches.filter(m => m.stage === 'qf' && m.winner_id)) {
    assign(regOfGt.get(loserGt(m)!), '5-8')
  }
  // vse ostale prijave (poraženci r16 + neuvrščeni iz skupin)
  for (const r of registrations) assign(r.id, '9-16')

  const out: PlayerPoints[] = []
  for (const r of registrations) {
    const bucket = bucketByReg.get(r.id)!
    const points = bucketPoints(bucket)
    // Registriran igralec (users) ali gost-igralec (guest_players) — oba imata
    // stabilen UUID in štejeta v lestvico serije. Prosto ime brez UUID se izpusti.
    const p1 = r.player1_id ?? r.player1_guest_id ?? null
    const p2 = r.player2_id ?? r.player2_guest_id ?? null
    if (p1) out.push({ player_id: p1, points, bucket })
    if (p2) out.push({ player_id: p2, points, bucket })
  }
  return out
}
