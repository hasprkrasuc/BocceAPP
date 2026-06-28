import { describe, test, expect } from 'vitest'
import {
  bucketPoints, isPairDiscipline, tournamentPlayerPoints, PLACEMENT_POINTS,
} from './tournamentPlacement'

describe('bucketPoints', () => {
  test('preslika koše v točke po tabeli (16/10/8/7/3/1)', () => {
    expect(bucketPoints(1)).toBe(16)
    expect(bucketPoints(2)).toBe(10)
    expect(bucketPoints(3)).toBe(8)
    expect(bucketPoints(4)).toBe(7)
    expect(bucketPoints('5-8')).toBe(3)
    expect(bucketPoints('9-16')).toBe(1)
  })
  test('PLACEMENT_POINTS je izvožen za prikaz', () => {
    expect(PLACEMENT_POINTS.p1).toBe(16)
    expect(PLACEMENT_POINTS.p9_16).toBe(1)
  })
})

describe('isPairDiscipline', () => {
  test('dvojka in štafeta sta para', () => {
    expect(isPairDiscipline('dvojka')).toBe(true)
    expect(isPairDiscipline('stafeta')).toBe(true)
  })
  test('posamezne discipline niso para', () => {
    for (const d of ['posamezno', 'hitrostno', 'natancno', 'blizanje', 'blizanje_krog', 'krog'] as const) {
      expect(isPairDiscipline(d)).toBe(false)
    }
  })
})

describe('tournamentPlayerPoints', () => {
  // 8 prijav (r1..r8), group_teams gt1..gt8, izločilni boji od četrtfinala
  const registrations = Array.from({ length: 8 }, (_, i) => ({
    id: `r${i + 1}`, player1_id: `p${i + 1}`, player2_id: null,
  }))
  const groupTeams = Array.from({ length: 8 }, (_, i) => ({
    id: `gt${i + 1}`, registration_id: `r${i + 1}`,
  }))
  // qf: gt1>gt8, gt2>gt7, gt3>gt6, gt4>gt5  → poraženci gt5..gt8 = 5-8
  // sf: gt1>gt2, gt3>gt4
  // final: gt1>gt3 ; za 3. mesto: gt2>gt4
  const knockoutMatches = [
    { stage: 'qf', team_a_id: 'gt1', team_b_id: 'gt8', winner_id: 'gt1' },
    { stage: 'qf', team_a_id: 'gt2', team_b_id: 'gt7', winner_id: 'gt2' },
    { stage: 'qf', team_a_id: 'gt3', team_b_id: 'gt6', winner_id: 'gt3' },
    { stage: 'qf', team_a_id: 'gt4', team_b_id: 'gt5', winner_id: 'gt4' },
    { stage: 'sf', team_a_id: 'gt1', team_b_id: 'gt2', winner_id: 'gt1' },
    { stage: 'sf', team_a_id: 'gt3', team_b_id: 'gt4', winner_id: 'gt3' },
    { stage: 'final', team_a_id: 'gt1', team_b_id: 'gt3', winner_id: 'gt1' },
    { stage: 'third_place', team_a_id: 'gt2', team_b_id: 'gt4', winner_id: 'gt2' },
  ]

  test('določi mesta 1–4 iz finala in tekme za 3. mesto', () => {
    const pts = tournamentPlayerPoints({ registrations, groupTeams, knockoutMatches })
    const byPlayer = Object.fromEntries(pts.map(p => [p.player_id, p]))
    expect(byPlayer['p1'].bucket).toBe(1); expect(byPlayer['p1'].points).toBe(16)
    expect(byPlayer['p3'].bucket).toBe(2); expect(byPlayer['p3'].points).toBe(10)
    expect(byPlayer['p2'].bucket).toBe(3); expect(byPlayer['p2'].points).toBe(8)
    expect(byPlayer['p4'].bucket).toBe(4); expect(byPlayer['p4'].points).toBe(7)
  })

  test('poraženci četrtfinala dobijo 5–8 (3 točke)', () => {
    const pts = tournamentPlayerPoints({ registrations, groupTeams, knockoutMatches })
    for (const p of ['p5', 'p6', 'p7', 'p8']) {
      const e = pts.find(x => x.player_id === p)!
      expect(e.bucket).toBe('5-8'); expect(e.points).toBe(3)
    }
  })

  test('neuvrščeni iz skupin (niso v izločilnih bojih) dobijo 9–16 (1 točka)', () => {
    const regs = [...registrations, { id: 'r9', player1_id: 'p9', player2_id: null }]
    const gts = [...groupTeams, { id: 'gt9', registration_id: 'r9' }]
    const pts = tournamentPlayerPoints({ registrations: regs, groupTeams: gts, knockoutMatches })
    const e = pts.find(x => x.player_id === 'p9')!
    expect(e.bucket).toBe('9-16'); expect(e.points).toBe(1)
  })

  test('par (dvojka/štafeta): oba člana dobita iste točke, vsak svojo vrstico', () => {
    const regs = [{ id: 'r1', player1_id: 'pa', player2_id: 'pb' }]
    const gts = [{ id: 'gt1', registration_id: 'r1' }]
    // edina prijava brez izločilnih bojev → 9-16
    const pts = tournamentPlayerPoints({ registrations: regs, groupTeams: gts, knockoutMatches: [] })
    expect(pts).toHaveLength(2)
    expect(pts.map(p => p.player_id).sort()).toEqual(['pa', 'pb'])
    expect(pts.every(p => p.points === 1)).toBe(true)
  })
})
