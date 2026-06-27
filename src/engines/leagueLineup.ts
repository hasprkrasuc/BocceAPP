/**
 * VALIDACIJA SESTAVOV — ženska 1. liga članice
 *
 * Pravilo:
 *  - Igralka igra največ 3 discipline na tekmo; IZJEMOMA 4, in sicer le, če v
 *    bloku 2 igra natanko par Hitrostno + Štafeta.
 *  - Pri 3 (ali manj) disciplinah je kombinacija v bloku 2 prosta — igralka lahko
 *    igra katerikoli dve disciplini bloka 2 (npr. Natančno + Štafeta).
 *
 * Blok 2 = vzporedne discipline: Hitrostno, Natančno izbijanje, Natančno bližanje,
 * Štafeta. Pravilo velja le za sezone s to strukturo — glej seasonUsesBlock2Rule().
 */

export interface LineupDisc {
  discipline_type: string
  block_number: number | null
}

export interface LineupEval {
  count: number
  maxAllowed: number
  countViolation: boolean
  ok: boolean
}

/** Ali sta v bloku 2 natanko Hitrostno + Štafeta? (edini par, ki dovoli 4. disciplino) */
function isHitStaPair(block2: LineupDisc[]): boolean {
  if (block2.length !== 2) return false
  const types = new Set(block2.map(d => d.discipline_type))
  return types.size === 2 && types.has('hitrostno') && types.has('stafeta')
}

/** Oceni sestav ene igralke (seznam disciplin, ki jih igra na tekmi). */
export function evaluatePlayerLineup(discs: LineupDisc[]): LineupEval {
  const count = discs.length
  const block2 = discs.filter(d => d.block_number === 2)
  const maxAllowed = isHitStaPair(block2) ? 4 : 3
  const countViolation = count > maxAllowed

  return { count, maxAllowed, countViolation, ok: !countViolation }
}

/**
 * Ali sezona uporablja pravilo bloka 2 (Hitrostno + Štafeta + Natančno v bloku 2)?
 * Tako pravilo omejimo na žensko 1. ligo in podobne strukture, ne na moške lige.
 */
export function seasonUsesBlock2Rule(disciplines: LineupDisc[]): boolean {
  const b2 = new Set(disciplines.filter(d => d.block_number === 2).map(d => d.discipline_type))
  return b2.has('hitrostno') && b2.has('stafeta')
}
