/**
 * Čista logika za obdelavo realtime payloadov.
 *
 * Ločena od React ovojnice (`useRealtimeTable`), da je testabilna — repo testira
 * samo čisto logiko.
 */

/** Osnovni zamik pred refetchem (ms). */
export const RELOAD_DELAY_MS = 500
/** Naključni dodatek na zamik (ms) — razporedi odjemalce čez ~1,5 s. */
export const RELOAD_JITTER_MS = 1500

/**
 * Zamik za odloženi refetch. Naključni raztezek je bistvo: brez njega 150
 * odjemalcev sproži refetch v isti milisekundi in baza s 60 povezavami dobi
 * sunek, ki ga je popravek ravno hotel odpraviti.
 *
 * @param random vrednost iz [0, 1) — podana zaradi testabilnosti
 */
export function reloadDelayMs(
  random: number,
  delay = RELOAD_DELAY_MS,
  jitter = RELOAD_JITTER_MS,
): number {
  return delay + random * jitter
}

/**
 * Vstavi posodobljeno vrstico iz realtime payloada v obstoječi seznam.
 *
 * Payload nese samo stolpce tabele — ugnezdenih embedov (`home_team`,
 * `team_a`, `chief_judge` ...), ki jih je prinesla prvotna poizvedba, v njem ni.
 * Zato vrstico razširimo čez obstoječo namesto da bi jo zamenjali: manjkajoči
 * ključi ostanejo, spremenjeni se povozijo.
 *
 * Vrstica, ki je v seznamu ni, se NE doda — seznam je omejen s poizvedbo
 * (npr. ena sezona), zato bi vrivanje tujega zapisa prikazalo podatek, ki tja
 * ne sodi. Take primere obravnava strukturni refetch.
 */
export function mergeRowById<T extends { id: string }>(list: T[], row: Partial<T> & { id: string }): T[] {
  let changed = false
  const next = list.map(item => {
    if (item.id !== row.id) return item
    changed = true
    return { ...item, ...row }
  })
  // Brez sprememb vrnemo isto referenco — React se izogne ponovnemu izrisu.
  return changed ? next : list
}
