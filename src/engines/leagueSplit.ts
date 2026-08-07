/**
 * RAZDELITVENI SISTEM (OBZ Nova Gorica) — 10 ekip, 9 + 5 kol.
 *
 * Faza 1: vseh 10 ekip enokrožno po Bergerju → 9 kol, 45 tekem.
 *         Vsak par se sreča natanko enkrat.
 *
 * Faza 2: po lestvici po 9 kolih se liga razdeli na dve skupini po pet —
 *         '1-5' (najboljših pet) in '6-10' (zadnjih pet). V vsaki skupini
 *         se odigra še 5 kol; ker je ekip pet, vsako kolo ena počiva
 *         (2 tekmi na kolo, 10 tekem na skupino).
 *
 * DOM/GOST V FAZI 2 SE OBRNE. Če sta se ekipi v fazi 1 srečali pri X, se
 * v fazi 2 srečata pri Y. To je edino pravilo, ki razpored fazi 2 veže na
 * fazo 1 — in je vedno izvedljivo, ker so v fazi 1 vsi igrali z vsemi
 * natanko enkrat, torej je za vsak par domača ekipa enolično določena.
 *
 * Zaradi tega obrata TA MODUL NE UPORABLJA dom/gost iz Bergerjeve tabele —
 * iz nje vzame samo PARE in KOLA (kdo s kom in kdaj), stran pa določi iz
 * faze 1.
 *
 * Modul je čista logika brez I/O. Kako se točke iz faze 1 prenesejo v
 * lestvico faze 2, ni stvar tega modula — tu nastane samo razpored.
 */

import { bergerSchedule } from './berger'

/** Število ekip v ligi (faza 1). */
export const SPLIT_TEAMS = 10
/** Število ekip v vsaki skupini faze 2. */
export const SPLIT_GROUP_SIZE = 5
/** Kol v fazi 1 (enokrožno med 10 ekipami). */
export const SPLIT_PHASE1_ROUNDS = 9
/** Kol v fazi 2 (enokrožno med 5 ekipami, z eno prosto na kolo). */
export const SPLIT_PHASE2_ROUNDS = 5

export type SplitGroupLabel = '1-5' | '6-10'
export const SPLIT_TOP: SplitGroupLabel = '1-5'
export const SPLIT_BOTTOM: SplitGroupLabel = '6-10'

export interface SplitTeam {
  id: string
  /** Uvrstitev po 9 kolih ZNOTRAJ svoje skupine faze 2: 1..5. */
  position: number
}

export interface SplitFixture {
  round_number: number
  home_team_id: string
  away_team_id: string
  group_label: SplitGroupLabel
}

/** Minimalna oblika tekme faze 1, ki jo potrebujemo za obrat dom/gost. */
export interface Phase1Meeting {
  home_team_id: string
  away_team_id: string
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/**
 * Razdeli lestvico po 9 kolih na zgornjo in spodnjo skupino.
 * Vhod mora biti že urejen (1. mesto prvo) — urejanje je stvar
 * `calculateStandings`, ne tega modula.
 */
export function splitGroups<T>(standings: T[]): { top: T[]; bottom: T[] } {
  if (standings.length !== SPLIT_TEAMS) {
    throw new Error(
      `Razdelitveni sistem zahteva natanko ${SPLIT_TEAMS} ekip (dobljeno ${standings.length}).`,
    )
  }
  return {
    top: standings.slice(0, SPLIT_GROUP_SIZE),
    bottom: standings.slice(SPLIT_GROUP_SIZE),
  }
}

/**
 * Kdo je bil v fazi 1 doma. Vrne mapo par → id domače ekipe.
 * @throws če se je par srečal večkrat (faza 1 mora biti enokrožna).
 */
function homeByPair(phase1: Phase1Meeting[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const f of phase1) {
    const key = pairKey(f.home_team_id, f.away_team_id)
    if (map.has(key)) {
      throw new Error(
        'Faza 1 razdelitvenega sistema mora biti enokrožna: par se je srečal večkrat, ' +
        'zato obrat dom/gost ni enoličen.',
      )
    }
    map.set(key, f.home_team_id)
  }
  return map
}

/**
 * Razpored faze 2 za eno skupino petih.
 *
 * Pare in kola vzame iz Bergerjeve tabele za 5 ekip (tabela za 6, kjer je
 * številka 6 prosta), preslikane po `position`. Dom/gost NE vzame iz tabele,
 * ampak ga obrne glede na fazo 1.
 *
 * @param group    pet ekip z uvrstitvijo 1..5 znotraj skupine
 * @param label    '1-5' ali '6-10'
 * @param startRound  prvo kolo faze 2 (pri 9 kolih faze 1 je to 10)
 * @param phase1   tekme faze 1 (lahko vse; uporabijo se le pari te skupine)
 */
export function splitPhase2Fixtures(
  group: SplitTeam[],
  label: SplitGroupLabel,
  startRound: number,
  phase1: Phase1Meeting[],
): SplitFixture[] {
  if (group.length !== SPLIT_GROUP_SIZE) {
    throw new Error(
      `Skupina "${label}" mora imeti natanko ${SPLIT_GROUP_SIZE} ekip (dobljeno ${group.length}).`,
    )
  }

  const idByPosition = new Map<number, string>()
  for (const t of group) {
    if (t.position < 1 || t.position > SPLIT_GROUP_SIZE || !Number.isInteger(t.position)) {
      throw new Error(
        `Skupina "${label}": uvrstitev mora biti celo število 1..${SPLIT_GROUP_SIZE} (dobljeno ${t.position}).`,
      )
    }
    if (idByPosition.has(t.position)) {
      throw new Error(`Skupina "${label}": podvojena uvrstitev ${t.position}.`)
    }
    idByPosition.set(t.position, t.id)
  }
  for (let p = 1; p <= SPLIT_GROUP_SIZE; p++) {
    if (!idByPosition.has(p)) throw new Error(`Skupina "${label}": manjka uvrstitev ${p}.`)
  }

  const home1 = homeByPair(phase1)

  return bergerSchedule(SPLIT_GROUP_SIZE).map(g => {
    const x = idByPosition.get(g.home)!
    const y = idByPosition.get(g.away)!
    const phase1Home = home1.get(pairKey(x, y))
    if (!phase1Home) {
      throw new Error(
        `Skupina "${label}": para ni v fazi 1, zato dom/gost ni mogoče obrniti. ` +
        'V fazi 1 morajo vse ekipe odigrati med sabo.',
      )
    }
    // Obrat: kdor je bil v fazi 1 doma, je zdaj v gosteh.
    const home = phase1Home === x ? y : x
    const away = phase1Home === x ? x : y
    return {
      round_number: startRound + g.round - 1,
      home_team_id: home,
      away_team_id: away,
      group_label: label,
    }
  })
}

/**
 * Preveri, ali je faza 1 pripravljena za razdelitev: natanko 10 ekip,
 * vsak par natanko enkrat in vse tekme odigrane.
 * Vrne seznam napak v slovenščini (prazen seznam = pripravljeno).
 */
export function validateSplitPhase1(
  teams: { id: string }[],
  phase1: (Phase1Meeting & { status: string })[],
): string[] {
  const errors: string[] = []

  if (teams.length !== SPLIT_TEAMS) {
    errors.push(`Razdelitveni sistem zahteva natanko ${SPLIT_TEAMS} ekip (trenutno ${teams.length}).`)
  }

  const expected = (teams.length * (teams.length - 1)) / 2
  if (phase1.length !== expected) {
    errors.push(`Faza 1 mora imeti ${expected} tekem (trenutno ${phase1.length}).`)
  }

  const seen = new Set<string>()
  for (const f of phase1) {
    const key = pairKey(f.home_team_id, f.away_team_id)
    if (seen.has(key)) {
      errors.push('Faza 1 ni enokrožna: nekatere ekipe so se srečale večkrat.')
      break
    }
    seen.add(key)
  }

  const unplayed = phase1.filter(f => f.status !== 'completed').length
  if (unplayed > 0) {
    errors.push(`Faza 1 še ni končana: ${unplayed} tekem brez rezultata.`)
  }

  return errors
}
