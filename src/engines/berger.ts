/**
 * BERGERJEV SISTEM — generator ligaškega razporeda
 *
 * Vse lige (članske in mladinske) potekajo po Bergerjevem sistemu, enokrožno
 * ali dvokrožno. Opravi se žreb, kjer vsaka ekipa dobi številko (1..N), nato
 * se razpored sestavi po Bergerjevi tabeli (BZS, Priloga B) za to število ekip.
 *
 * Številke v tabelah so 1-indeksirane (= žrebana številka ekipe). Pri lihem
 * številu ekip se uporabi tabela za naslednje sodo število; najvišja številka
 * je "prosta" (bye) — ekipa, ki bi igrala proti njej, tisti krog počiva.
 *
 * Tabele so prepisane točno iz Priloge B (dom = leva številka, gost = desna).
 */

export const MAX_BERGER_TEAMS = 12

export interface BergerGame {
  round: number
  /** žrebana številka domače ekipe (1..teamCount) */
  home: number
  /** žrebana številka gostujoče ekipe (1..teamCount) */
  away: number
}

/** Bergerjeve tabele po sodem številu ekip: krog → [dom, gost][] */
const BERGER_TABLES: Record<number, number[][][]> = {
  4: [
    [[1, 4], [2, 3]],
    [[4, 3], [1, 2]],
    [[2, 4], [3, 1]],
  ],
  6: [
    [[1, 6], [2, 5], [3, 4]],
    [[6, 4], [5, 3], [1, 2]],
    [[2, 6], [3, 1], [4, 5]],
    [[6, 5], [1, 4], [2, 3]],
    [[3, 6], [4, 2], [5, 1]],
  ],
  8: [
    [[1, 8], [2, 7], [3, 6], [4, 5]],
    [[8, 5], [6, 4], [7, 3], [1, 2]],
    [[2, 8], [3, 1], [4, 7], [5, 6]],
    [[8, 6], [7, 5], [1, 4], [2, 3]],
    [[3, 8], [4, 2], [5, 1], [6, 7]],
    [[8, 7], [1, 6], [2, 5], [3, 4]],
    [[4, 8], [5, 3], [6, 2], [7, 1]],
  ],
  10: [
    [[1, 10], [2, 9], [3, 8], [4, 7], [5, 6]],
    [[10, 6], [7, 5], [8, 4], [9, 3], [1, 2]],
    [[2, 10], [3, 1], [4, 9], [5, 8], [6, 7]],
    [[10, 7], [8, 6], [9, 5], [1, 4], [2, 3]],
    [[3, 10], [4, 2], [5, 1], [6, 9], [7, 8]],
    [[10, 8], [9, 7], [1, 6], [2, 5], [3, 4]],
    [[4, 10], [5, 3], [6, 2], [7, 1], [8, 9]],
    [[10, 9], [1, 8], [2, 7], [3, 6], [4, 5]],
    [[5, 10], [6, 4], [7, 3], [8, 2], [9, 1]],
  ],
  12: [
    [[1, 12], [2, 11], [3, 10], [4, 9], [5, 8], [6, 7]],
    [[12, 7], [8, 6], [9, 5], [10, 4], [11, 3], [1, 2]],
    [[2, 12], [3, 1], [4, 11], [5, 10], [6, 9], [7, 8]],
    [[12, 8], [9, 7], [10, 6], [11, 5], [1, 4], [2, 3]],
    [[3, 12], [4, 2], [5, 1], [6, 11], [7, 10], [8, 9]],
    [[12, 9], [10, 8], [11, 7], [1, 6], [2, 5], [3, 4]],
    [[4, 12], [5, 3], [6, 2], [7, 1], [8, 11], [9, 10]],
    [[12, 10], [11, 9], [1, 8], [2, 7], [3, 6], [4, 5]],
    [[5, 12], [6, 4], [7, 3], [8, 2], [9, 1], [10, 11]],
    [[12, 11], [1, 10], [2, 9], [3, 8], [4, 7], [5, 6]],
    [[6, 12], [7, 5], [8, 4], [9, 3], [10, 2], [11, 1]],
  ],
}

/**
 * Sestavi ligaški razpored po Bergerjevem sistemu za dano število ekip.
 *
 * @param teamCount  število ekip (2..12); pri lihem se uporabi tabela N+1 in
 *                   najvišja številka pomeni "prosto" (bye).
 * @param doubleRound  če true, doda še povratni del z zamenjanim dom/gost.
 * @returns seznam iger; številke so žrebane številke ekip (1..teamCount).
 */
export function bergerSchedule(teamCount: number, doubleRound = false): BergerGame[] {
  if (!Number.isInteger(teamCount) || teamCount < 2) {
    throw new Error(`Bergerjev razpored: potrebni sta vsaj 2 ekipi (podano ${teamCount}).`)
  }
  const evenN = teamCount % 2 === 0 ? teamCount : teamCount + 1
  const table = BERGER_TABLES[evenN]
  if (!table) {
    throw new Error(
      `Bergerjeva tabela za ${teamCount} ekip ni na voljo (podprto do ${MAX_BERGER_TEAMS} ekip).`,
    )
  }

  const single: BergerGame[] = []
  table.forEach((round, idx) => {
    for (const [home, away] of round) {
      // pri lihem številu: igre proti "prosti" (najvišji) številki preskočimo
      if (home > teamCount || away > teamCount) continue
      single.push({ round: idx + 1, home, away })
    }
  })

  if (!doubleRound) return single

  const offset = evenN - 1
  const second = single.map(g => ({
    round: g.round + offset,
    home: g.away,
    away: g.home,
  }))
  return [...single, ...second]
}

export interface BergerFixture {
  round_number: number
  home_team_id: string
  away_team_id: string
}

interface DrawnTeam {
  id: string
  draw_number: number | null
}

/**
 * Sestavi ligaške tekme po Bergerju iz ekip z dodeljenimi žrebanimi številkami.
 * Preslikava poteka po `draw_number` (žrebana številka), ne po vrstnem redu v seznamu.
 *
 * @throws če žrebane številke niso zaporedne 1..N brez ponovitev in vrzeli.
 */
export function bergerFixtures(teams: DrawnTeam[], doubleRound = false): BergerFixture[] {
  const n = teams.length
  const numbers = teams.map(t => t.draw_number)
  if (numbers.some(num => num == null)) {
    throw new Error('Žreb ni dokončan: vse ekipe morajo imeti žrebano številko.')
  }
  const unique = new Set(numbers as number[])
  if (unique.size !== n) {
    throw new Error('Žreb ni veljaven: žrebane številke se ponavljajo.')
  }
  for (let i = 1; i <= n; i++) {
    if (!unique.has(i)) {
      throw new Error(`Žreb ni veljaven: žrebane številke morajo biti zaporedne 1..${n} (manjka ${i}).`)
    }
  }

  const idByNumber = new Map<number, string>()
  for (const t of teams) idByNumber.set(t.draw_number as number, t.id)

  return bergerSchedule(n, doubleRound).map(g => ({
    round_number: g.round,
    home_team_id: idByNumber.get(g.home)!,
    away_team_id: idByNumber.get(g.away)!,
  }))
}
