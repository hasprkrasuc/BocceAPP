/**
 * DP točkovanje po KONČNI UVRSTITVI (final_rank).
 *
 *   1. = 16 · 2. = 10 · 3. = 8 · 4. = 7 · 5.–8. = 3 · 9.–16. = 1 · 17.+ = 0
 *
 * Deljeni bron (ni tekme za 3. mesto) uvozimo kot DVE ekipi z rankom 3 → obe 8.
 * Pri dvojicah/štafetah dobita oba igralca ekipe iste točke (klic na igralca).
 *
 * Vir uvrstitve je grafikon DP (KONČNI VRSTNI RED), shranjen v
 * tournament_registrations.final_rank.
 */

export function placementPoints(rank: number): number {
  if (!Number.isInteger(rank) || rank < 1) return 0
  if (rank === 1) return 16
  if (rank === 2) return 10
  if (rank === 3) return 8
  if (rank === 4) return 7
  if (rank <= 8) return 3
  if (rank <= 16) return 1
  return 0
}

export function placementLabel(rank: number): string {
  if (rank >= 5 && rank <= 8) return '5.–8. mesto'
  if (rank >= 9 && rank <= 16) return '9.–16. mesto'
  return `${rank}. mesto`
}
