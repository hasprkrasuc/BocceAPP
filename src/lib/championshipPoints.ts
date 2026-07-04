/**
 * Točkovanje državnih prvenstev (DP) po uvrstitvi iz izločilnih bojev.
 *
 *   1. mesto 16 · 2. mesto 10 · 3. mesto 8 · 4. mesto 7 · 5.–8. mesto 3 · 9.–16. mesto 1
 *
 * Deljeni bron: če DP nima tekme za 3. mesto, oba poraženca polfinala dobita 8 t.
 * Pri dvojicah dobita oba igralca ekipe iste točke.
 */

export interface ChampKoMatch {
  stage: string            // 'r16' | 'qf' | 'sf' | 'final' | 'third_place'
  winnerId: string | null  // group_team id zmagovalca
  teamAId: string | null
  teamBId: string | null
}

export interface ChampAward {
  playerId: string
  pts: number
  placeLabel: string
}

const FINAL = { winner: 16, loser: 10, winnerPlace: '1. mesto', loserPlace: '2. mesto' }
const THIRD = { winner: 8, loser: 7, winnerPlace: '3. mesto', loserPlace: '4. mesto' }
const STAGE_LOSER: Record<string, { pts: number; place: string }> = {
  qf:  { pts: 3, place: '5.–8. mesto' },
  r16: { pts: 1, place: '9.–16. mesto' },
}
const SHARED_BRONZE = { pts: 8, place: '3. mesto' }

export function championshipPoints(
  matches: ChampKoMatch[],
  playersByTeam: Record<string, string[]>,
): ChampAward[] {
  const hasThirdPlace = matches.some(m => m.stage === 'third_place' && m.winnerId)
  const awards: ChampAward[] = []

  const give = (teamId: string | null, pts: number, placeLabel: string) => {
    if (!teamId || pts <= 0) return
    for (const pid of playersByTeam[teamId] ?? []) awards.push({ playerId: pid, pts, placeLabel })
  }

  for (const m of matches) {
    if (!m.winnerId) continue
    const loserId = m.winnerId === m.teamAId ? m.teamBId : m.teamAId
    switch (m.stage) {
      case 'final':
        give(m.winnerId, FINAL.winner, FINAL.winnerPlace)
        give(loserId, FINAL.loser, FINAL.loserPlace)
        break
      case 'third_place':
        give(m.winnerId, THIRD.winner, THIRD.winnerPlace)
        give(loserId, THIRD.loser, THIRD.loserPlace)
        break
      case 'sf':
        // brez tekme za 3. mesto → deljeni bron obema polfinalistoma-poražencema
        if (!hasThirdPlace) give(loserId, SHARED_BRONZE.pts, SHARED_BRONZE.place)
        break
      default: {
        const sl = STAGE_LOSER[m.stage]
        if (sl) give(loserId, sl.pts, sl.place)
      }
    }
  }
  return awards
}
