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
