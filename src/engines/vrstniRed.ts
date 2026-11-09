/**
 * KONČNI VRSTNI RED DRŽAVNEGA PRVENSTVA
 *
 * Po zadnji odigrani tekmi se uvrstitve izpeljejo iz grafikona:
 *
 *   1./2.  — finale
 *   3./4.  — tekma za 3. mesto (če je ni, poraženca polfinala po pravilu spodaj)
 *   5.–8.  — poraženci četrtfinala, RAZVRŠČENI: najprej manjša razlika poraza,
 *            ob enaki razliki več doseženih točk v tisti tekmi
 *   9.–16. — poraženci osmine finala, enako pravilo; nižji krogi naprej
 *   nato   — izpadli iz skupin: najprej tretji iz skupin, nato četrti, nato
 *            peti; znotraj ravni enako pravilo (po tekmi, s katero so izpadli)
 *
 * Nobeno mesto ni deljeno — pravilo razlike/točk razvrsti vse.
 */

import { KO_STAGE_ORDER } from './knockout'
import type { MatchStage } from '../types'

export interface TekmaVrstnegaReda {
  stage: MatchStage
  matchNumber: number
  teamA: string | null
  teamB: string | null
  winner: string | null
  scoreA: number | null
  scoreB: number | null
  isBye: boolean
  status: string
}

export interface SkupinaVrstnegaReda {
  /** Število ekip v skupini (3–5) — določa, katere tekme dajo uvrstitve. */
  velikost: number
  tekme: TekmaVrstnegaReda[]
}

/** Poraz: kdo, s kakšno razliko in koliko točk je dosegel. */
interface Poraz { team: string; razlika: number; tocke: number }

function porazTekme(m: TekmaVrstnegaReda): Poraz | null {
  if (m.isBye || m.status !== 'completed' || !m.winner) return null
  const porazenec = m.winner === m.teamA ? m.teamB : m.teamA
  if (!porazenec) return null
  const a = m.scoreA ?? 0, b = m.scoreB ?? 0
  return {
    team: porazenec,
    razlika: Math.abs(a - b),
    tocke: m.winner === m.teamA ? b : a,
  }
}

/** Pravilo razvrščanja izpadlih: manjša razlika poraza, nato več doseženih točk. */
function razvrstiPorazence(porazi: Poraz[]): string[] {
  return [...porazi]
    .sort((x, y) => (x.razlika - y.razlika) || (y.tocke - x.tocke) || x.team.localeCompare(y.team))
    .map(p => p.team)
}

/**
 * Ali je prvenstvo odigrano do konca: finale obstaja in je odigran, prav tako
 * vse ostale tekme (razen prostih — bye).
 */
export function jePrvenstvoOdigrano(
  izlocilne: TekmaVrstnegaReda[],
  skupine: SkupinaVrstnegaReda[],
): boolean {
  const fin = izlocilne.find(m => m.stage === 'final')
  if (!fin || fin.status !== 'completed' || !fin.winner) return false
  const vse = [...izlocilne, ...skupine.flatMap(s => s.tekme)]
  return vse.every(m => m.isBye || m.status === 'completed')
}

/**
 * Katera tekma skupine da katero mesto izpadlega (po GROUP_TEMPLATES):
 * raven 1 = tretji v skupini (poraženec repasaža), raven 2 = četrti,
 * raven 3 = peti. Skupina s 3 ekipami ima samo tretjega.
 */
const IZPADLI_PO_VELIKOSTI: Record<number, { raven: number; tekma: number }[]> = {
  3: [{ raven: 1, tekma: 5 }],
  4: [{ raven: 1, tekma: 5 }, { raven: 2, tekma: 4 }],
  5: [{ raven: 1, tekma: 9 }, { raven: 2, tekma: 8 }, { raven: 3, tekma: 5 }],
}

/**
 * Izračuna končni vrstni red (ekipa → mesto) iz izločilnih in skupinskih
 * tekem. Ekipe so group_teams idji (ali registracije pri čistem izločilnem
 * formatu) — preslikavo v prijave opravi klicatelj.
 */
export function koncniVrstniRedPrvenstva(
  izlocilne: TekmaVrstnegaReda[],
  skupine: SkupinaVrstnegaReda[],
): Map<string, number> {
  const mesta = new Map<string, number>()

  const fin = izlocilne.find(m => m.stage === 'final')
  if (!fin?.winner) return mesta
  const porazenecFinala = fin.winner === fin.teamA ? fin.teamB : fin.teamA
  mesta.set(fin.winner, 1)
  if (porazenecFinala) mesta.set(porazenecFinala, 2)

  const tretja = izlocilne.find(m => m.stage === 'third_place')
  if (tretja?.winner) {
    const porazenec = tretja.winner === tretja.teamA ? tretja.teamB : tretja.teamA
    mesta.set(tretja.winner, 3)
    if (porazenec) mesta.set(porazenec, 4)
  }

  // Nižji krogi od polfinala navzdol: poraženci vsakega kroga, ki še nimajo
  // mesta (polfinalista ga imata, če je bila tekma za 3. mesto), po pravilu.
  const krogi = [...KO_STAGE_ORDER].reverse().filter(s => s !== 'final')
  for (const krog of krogi) {
    const porazi = izlocilne
      .filter(m => m.stage === krog)
      .map(porazTekme)
      .filter((p): p is Poraz => !!p && !mesta.has(p.team))
    for (const team of razvrstiPorazence(porazi)) mesta.set(team, mesta.size + 1)
  }

  // Izpadli iz skupin: po ravneh (tretji, četrti, peti), znotraj ravni po
  // tekmi, s katero so izpadli.
  for (const raven of [1, 2, 3]) {
    const porazi: Poraz[] = []
    for (const s of skupine) {
      const mestaRavni = IZPADLI_PO_VELIKOSTI[s.velikost] ?? IZPADLI_PO_VELIKOSTI[4]
      const vnos = mestaRavni.find(x => x.raven === raven)
      if (!vnos) continue
      const tekma = s.tekme.find(m => m.matchNumber === vnos.tekma)
      const poraz = tekma ? porazTekme(tekma) : null
      if (poraz && !mesta.has(poraz.team)) porazi.push(poraz)
    }
    for (const team of razvrstiPorazence(porazi)) mesta.set(team, mesta.size + 1)
  }

  return mesta
}
