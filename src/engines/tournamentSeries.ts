export interface SeriesPlayerResult {
  player_id: string
  total: number
  counted: number[]
  dropped: number[]
  tournaments_played: number
}

/**
 * Združi točke igralca čez vse turnirje serije in uporabi "najboljših N".
 * @param perTournament  ena vrstica na (igralec, turnir)
 * @param countBest      N najboljših rezultatov; null = štejejo vsi
 */
export function seriesStandings(
  perTournament: { player_id: string; points: number }[],
  countBest: number | null,
): SeriesPlayerResult[] {
  const byPlayer = new Map<string, number[]>()
  for (const row of perTournament) {
    const arr = byPlayer.get(row.player_id) ?? []
    arr.push(row.points)
    byPlayer.set(row.player_id, arr)
  }

  const results: SeriesPlayerResult[] = []
  for (const [player_id, pointsArr] of byPlayer) {
    const sorted = [...pointsArr].sort((a, b) => b - a)
    const n = countBest == null ? sorted.length : Math.min(countBest, sorted.length)
    const counted = sorted.slice(0, n)
    const dropped = sorted.slice(n)
    results.push({
      player_id,
      total: counted.reduce((s, p) => s + p, 0),
      counted,
      dropped,
      tournaments_played: pointsArr.length,
    })
  }

  return results.sort(
    (a, b) =>
      b.total - a.total ||
      b.tournaments_played - a.tournaments_played ||
      a.player_id.localeCompare(b.player_id),
  )
}
