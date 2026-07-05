/**
 * Krožni (Berger) ligaški sistem: vsak igra z vsakim, lestvica po točkah.
 * Zmaga = 2 točki, remi = 1, poraz = 0. Vrstni red: točke, nato razlika
 * (doseženi − prejeti), nato doseženi.
 */

export interface RRMatch {
  team_a_id: string | null
  team_b_id: string | null
  score_a: number | null
  score_b: number | null
  is_bye?: boolean
}

export interface RRTeamStat {
  teamId: string
  played: number
  wins: number
  draws: number
  losses: number
  scoreFor: number
  scoreAgainst: number
  points: number
}

export function roundRobinStandings(matches: RRMatch[]): RRTeamStat[] {
  const stats = new Map<string, RRTeamStat>()
  const ensure = (id: string): RRTeamStat => {
    let s = stats.get(id)
    if (!s) { s = { teamId: id, played: 0, wins: 0, draws: 0, losses: 0, scoreFor: 0, scoreAgainst: 0, points: 0 }; stats.set(id, s) }
    return s
  }

  for (const m of matches) {
    if (m.is_bye) continue
    if (!m.team_a_id || !m.team_b_id) continue
    if (m.score_a == null || m.score_b == null) continue
    const a = ensure(m.team_a_id), b = ensure(m.team_b_id)
    a.played++; b.played++
    a.scoreFor += m.score_a; a.scoreAgainst += m.score_b
    b.scoreFor += m.score_b; b.scoreAgainst += m.score_a
    if (m.score_a > m.score_b) { a.wins++; b.losses++; a.points += 2 }
    else if (m.score_a < m.score_b) { b.wins++; a.losses++; b.points += 2 }
    else { a.draws++; b.draws++; a.points += 1; b.points += 1 }
  }

  return [...stats.values()].sort((x, y) =>
    y.points - x.points ||
    (y.scoreFor - y.scoreAgainst) - (x.scoreFor - x.scoreAgainst) ||
    y.scoreFor - x.scoreFor,
  )
}
