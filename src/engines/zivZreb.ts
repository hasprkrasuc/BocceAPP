/**
 * ŽREB V ŽIVO — javni žreb skupin z jakostnimi bobni (državna prvenstva).
 *
 * Za razliko od takojšnjega žreba v administraciji (engines/tournament.ts,
 * `seededPotDraw`) je ta žreb namenjen izvedbi pred občinstvom. Pari pridejo
 * na vrsto po bobnih (znotraj bobna po rangu), vsakemu pa se NAJPREJ izžreba
 * SKUPINA in nato še MESTO v skupini — mesto določa razpored tekem v skupini
 * (GROUP_TEMPLATES), zato je tudi to del žreba, ne samodejna posledica bobna.
 *
 * Bobni se polnijo po rang lestvici, po NIVOJIH mest v skupini: boben 1 =
 * najboljših G parov (po en v vsako skupino), boben 2 = naslednjih G …
 * ZADNJI boben združi zadnji skupni nivo in vse globlje: pri 25 parih v
 * 1×4 + 7×3 skupin so bobni 8 + 8 + 9 — velika skupina dobi iz bobna 3 dva
 * para, vse ostale po enega.
 *
 * Modul pripravi načrt (bobne, kapacitete, vrstni red) in ponudi čiste
 * pomočnike za vsak korak; naključna izbira je stvar uporabniškega vmesnika.
 */

import type { SeededDrawTeam } from './tournament'

export interface NacrtZreba {
  /** Za vsak boben ID-ji parov, urejeni po rangu (najmočnejši najprej). */
  bobni: string[][]
  /** [boben][skupina] → koliko parov iz tega bobna dobi ta skupina. */
  kapacitete: number[][]
  /** Vrstni red žrebanja: po bobnih, znotraj bobna po rangu. */
  vrstniRed: string[]
  /** ID para → indeks njegovega bobna. */
  bobenPara: Map<string, number>
}

/** Ena opravljena dodelitev žreba. */
export interface ZrebDodelitev {
  id: string
  boben: number
  /** Indeks skupine (0 = skupina A). */
  skupina: number
  /** Mesto v skupini, 1-based. */
  sedez: number
}

/**
 * Načrt žreba iz rang vrednosti (`seed` padajoče, izenačeni po `id`) in
 * velikosti skupin.
 *
 * @throws če število ekip ne ustreza vsoti velikosti skupin.
 */
export function nacrtZivegaZreba(teams: SeededDrawTeam[], groupSizes: number[]): NacrtZreba {
  const mest = groupSizes.reduce((a, b) => a + b, 0)
  if (groupSizes.length === 0 || groupSizes.some(s => s < 1)) {
    throw new Error('Žreb v živo: vsaka skupina potrebuje vsaj eno mesto.')
  }
  if (mest !== teams.length) {
    throw new Error(`Žreb v živo: ${teams.length} parov ne sede v skupine (${mest} mest).`)
  }

  const sorted = [...teams].sort(
    (a, b) => (b.seed - a.seed) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  const minSize = Math.min(...groupSizes)
  const steviloBobnov = minSize

  // Kapacitete: iz bobnov pred zadnjim dobi vsaka skupina po en par, iz
  // zadnjega pa toliko, da se zapolni (velikost minus pari prejšnjih bobnov).
  const kapacitete: number[][] = []
  for (let b = 0; b < steviloBobnov; b++) {
    kapacitete.push(groupSizes.map(s => b < steviloBobnov - 1 ? 1 : s - (steviloBobnov - 1)))
  }

  const bobni: string[][] = []
  let idx = 0
  for (let b = 0; b < steviloBobnov; b++) {
    const velikost = kapacitete[b].reduce((a, c) => a + c, 0)
    bobni.push(sorted.slice(idx, idx + velikost).map(t => t.id))
    idx += velikost
  }

  const vrstniRed = bobni.flat()
  const bobenPara = new Map<string, number>()
  bobni.forEach((boben, b) => boben.forEach(id => bobenPara.set(id, b)))
  return { bobni, kapacitete, vrstniRed, bobenPara }
}

/** Skupine (indeksi), ki še lahko sprejmejo par iz danega bobna. */
export function prosteSkupine(
  nacrt: NacrtZreba,
  boben: number,
  dodelitve: ZrebDodelitev[],
): number[] {
  return nacrt.kapacitete[boben]
    .map((kapaciteta, gi) => ({ kapaciteta, gi }))
    .filter(({ kapaciteta, gi }) =>
      dodelitve.filter(d => d.boben === boben && d.skupina === gi).length < kapaciteta)
    .map(x => x.gi)
}

/** Prosta mesta (1-based) v dani skupini. */
export function prostaMesta(
  groupSizes: number[],
  skupina: number,
  dodelitve: ZrebDodelitev[],
): number[] {
  const zasedena = new Set(dodelitve.filter(d => d.skupina === skupina).map(d => d.sedez))
  return Array.from({ length: groupSizes[skupina] }, (_, i) => i + 1)
    .filter(s => !zasedena.has(s))
}
