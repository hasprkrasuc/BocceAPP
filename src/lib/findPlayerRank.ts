export interface PlayerRank {
  /** 1-indeksirano mesto na skupni rang lestvici */
  mesto: number
  /** skupne rang točke */
  rang: number
}

/** Poišče mesto in točke igralca na (razvrščeni) rang lestvici. */
export function findPlayerRank(
  rows: { playerId: string; rang: number }[],
  playerId: string,
): PlayerRank | null {
  const i = rows.findIndex(r => r.playerId === playerId)
  return i < 0 ? null : { mesto: i + 1, rang: rows[i].rang }
}

export interface CategoryPlayerRank extends PlayerRank {
  /** kategorija lestvice (men/women/u18/u14) */
  category: string
}

/**
 * Poišče igralca po vseh kategorijah rang lestvic; če nastopa v več,
 * vrne kategorijo z višjim rangom.
 */
export function findPlayerRankInCategories(
  byCategory: Record<string, { playerId: string; rang: number }[]>,
  playerId: string,
): CategoryPlayerRank | null {
  let best: CategoryPlayerRank | null = null
  for (const [category, rows] of Object.entries(byCategory)) {
    const i = rows.findIndex(r => r.playerId === playerId)
    if (i < 0) continue
    if (!best || rows[i].rang > best.rang) best = { mesto: i + 1, rang: rows[i].rang, category }
  }
  return best
}
