/**
 * Skupinski sistem lige: faza 2 ("nadaljevalni skupini").
 *
 * Po fazi 1 (dve skupini po 6, dvokrožno) se tvorita dve novi skupini:
 *  - '1-6'  = najboljše 3 iz skupine A + najboljše 3 iz skupine B
 *  - '7-12' = zadnje 3 iz skupine A + zadnje 3 iz skupine B
 *
 * V fazi 2 vsaka ekipa odigra SAMO s 3 ekipami iz DRUGE skupine faze 1,
 * doma in v gosteh (6 tekem na ekipo, 18 tekem skupaj). Rezultati proti
 * 2 ekipam iz lastne skupine faze 1 se prenesejo iz faze 1 (ne igrajo se
 * ponovno) — to obravnava druga koda, ne ta modul.
 *
 * Pozicije pomenijo KONČNO UVRSTITEV V FAZI 1 (position 1 = 1. mesto v
 * svoji skupini, position 3 = 3. mesto), ne številko žreba.
 */

export interface Phase2Team {
  id: string
  position: 1 | 2 | 3
}

export interface GeneratedFixture {
  round_number: number
  home_team_id: string
  away_team_id: string
  group_label: string
}

/**
 * Fiksna tabela federacije za skupino '1-6', kroga 1-3 (kroga 4-6 so
 * ista tabela z zamenjanim dom/gost — glej spodaj). Vsak vnos je
 * [pozicijaDoma iz A, pozicijaGost iz B].
 */
const BASE_ROUNDS: [number, number][][] = [
  // krog 1: A1:B3, A2:B1, A3:B2
  [[1, 3], [2, 1], [3, 2]],
  // krog 2: B2:A1, B3:A2, B1:A3  -> zapisano kot [pozicija A, pozicija B] z zastavico "B doma"
  [[1, 2], [2, 3], [3, 1]],
  // krog 3: A1:B1, A2:B2, A3:B3
  [[1, 1], [2, 2], [3, 3]],
]

// kateri krogi imajo B kot domačo ekipo (krog 2 v osnovni tabeli)
const BASE_ROUND_B_HOME = [false, true, false]

export function phase2Fixtures(
  groupA: Phase2Team[],
  groupB: Phase2Team[],
  groupLabel: '1-6' | '7-12',
  startRound: number,
): GeneratedFixture[] {
  if (groupA.length !== 3) {
    throw new Error(`phase2Fixtures: skupina A mora imeti natanko 3 ekipe (dobljeno ${groupA.length})`)
  }
  if (groupB.length !== 3) {
    throw new Error(`phase2Fixtures: skupina B mora imeti natanko 3 ekipe (dobljeno ${groupB.length})`)
  }

  const aById = new Map<number, string>()
  const bById = new Map<number, string>()
  for (const t of groupA) {
    if (aById.has(t.position)) {
      throw new Error(`phase2Fixtures: podvojena pozicija ${t.position} v skupini A`)
    }
    aById.set(t.position, t.id)
  }
  for (const t of groupB) {
    if (bById.has(t.position)) {
      throw new Error(`phase2Fixtures: podvojena pozicija ${t.position} v skupini B`)
    }
    bById.set(t.position, t.id)
  }
  for (const pos of [1, 2, 3]) {
    if (!aById.has(pos)) throw new Error(`phase2Fixtures: manjka pozicija ${pos} v skupini A`)
    if (!bById.has(pos)) throw new Error(`phase2Fixtures: manjka pozicija ${pos} v skupini B`)
  }

  // najprej sestavimo osnovne 3 kroge kot [home, away] pare team-id-jev
  const firstThreeRounds: { home: string; away: string }[][] = BASE_ROUNDS.map((round, idx) => {
    const bHome = BASE_ROUND_B_HOME[idx]
    return round.map(([posA, posB]) => {
      const teamA = aById.get(posA)!
      const teamB = bById.get(posB)!
      return bHome ? { home: teamB, away: teamA } : { home: teamA, away: teamB }
    })
  })

  // kroga 4-6 = kroga 1-3 z zamenjanim dom/gost, v istem vrstnem redu
  const lastThreeRounds = firstThreeRounds.map(round =>
    round.map(g => ({ home: g.away, away: g.home })),
  )

  const allRounds = [...firstThreeRounds, ...lastThreeRounds]

  const fixtures: GeneratedFixture[] = []
  allRounds.forEach((round, idx) => {
    const round_number = startRound + idx
    for (const g of round) {
      fixtures.push({
        round_number,
        home_team_id: g.home,
        away_team_id: g.away,
        group_label: groupLabel,
      })
    }
  })

  return fixtures
}

/**
 * Preveri žreb: natanko 6 ekip na skupino, številke 1..6 brez
 * podvojitev in brez lukenj. Vrne seznam napak v slovenščini
 * (prazen seznam = žreb je veljaven).
 */
export function validateDraw(
  teams: { id: string; group_label: string | null; draw_number: number | null }[],
): string[] {
  const errors: string[] = []

  const byGroup = new Map<string, { id: string; draw_number: number | null }[]>()
  for (const t of teams) {
    if (!t.group_label || t.draw_number == null) {
      errors.push(`Ekipa ${t.id} nima dodeljene skupine ali številke žreba.`)
      continue
    }
    const list = byGroup.get(t.group_label) ?? []
    list.push({ id: t.id, draw_number: t.draw_number })
    byGroup.set(t.group_label, list)
  }

  for (const [group, list] of byGroup) {
    if (list.length !== 6) {
      errors.push(`Skupina ${group} ima ${list.length} ekip namesto 6.`)
    }

    const numbers = list.map(t => t.draw_number as number)
    const seen = new Map<number, number>()
    for (const n of numbers) seen.set(n, (seen.get(n) ?? 0) + 1)
    for (const [n, count] of seen) {
      if (count > 1) {
        errors.push(`Skupina ${group}: številka žreba ${n} je uporabljena ${count}-krat.`)
      }
    }

    for (let n = 1; n <= 6; n++) {
      if (!seen.has(n)) {
        errors.push(`Skupina ${group}: manjka številka žreba ${n}.`)
      }
    }
  }

  return errors
}
