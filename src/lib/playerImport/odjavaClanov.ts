/**
 * ODJAVA ČLANOV IZ KLUBA OB UVOZU
 *
 * Seznam članov kluba v aplikaciji je preprosto `users.club_id`. Nič ga ne
 * čisti: kdor prestopi, se prepiše ob uvozu novega kluba, kdor pa neha
 * balinati, ostane na seznamu za vedno.
 *
 * Uvoz seznama za novo sezono je edini trenutek, ko aplikacija ve, kdo je
 * registriran — zato se odjava ponudi tu. Ponudi, ne izvede: odjava je ločeno
 * dejanje z lastno potrditvijo, nikoli stranski učinek uvoza.
 *
 * DVE STRAŽI, ker je napaka tu nepovratna (prejšnji klub se nikamor ne shrani):
 *
 *   1. Kdor ima v tej sezoni ekipo, ne more biti kandidat za odjavo — očitno je
 *      še aktiven, pa naj bo v datoteki ali ne (npr. mladinec, ki nastopa za
 *      drug klub, ali igralec, dodan ročno).
 *
 *   2. Če datoteka pokriva eno samo tekmovanje, odsotnost iz nje NE pomeni, da
 *      član ni več registriran — pomeni le, da ni prijavljen v to tekmovanje.
 *      Takrat vmesnik odjavo odsvetuje (glej `opozoriloOObsegu`).
 */

import type { ImportFormat } from './types'

export interface ClanKluba {
  id: string
  full_name: string | null
  birth_year: number | null
}

export interface Odjava {
  /** Člani kluba, ki jih v datoteki ni in v tej sezoni nimajo ekipe. */
  kandidati: ClanKluba[]
  /** Člani, ki jih v datoteki ni, a v tej sezoni ekipo imajo — odjava zanje ni na mestu. */
  zadrzani: ClanKluba[]
}

/**
 * Razvrsti člane kluba glede na uvoženo datoteko.
 *
 * @param clani         vsi člani izbranega kluba (users.club_id)
 * @param vDatoteki     id-ji članov, ki jih je uvoz ujel v tej datoteki
 * @param vEkipiSezone  id-ji igralcev, ki imajo ekipo v izbrani sezoni
 */
export function kandidatiZaOdjavo(
  clani: ClanKluba[],
  vDatoteki: Set<string>,
  vEkipiSezone: Set<string>,
): Odjava {
  const kandidati: ClanKluba[] = []
  const zadrzani: ClanKluba[] = []
  for (const c of clani) {
    if (vDatoteki.has(c.id)) continue
    if (vEkipiSezone.has(c.id)) zadrzani.push(c)
    else kandidati.push(c)
  }
  return { kandidati, zadrzani }
}

/**
 * Kaj datoteka sploh pokriva — od tega je odvisno, ali odsotnost iz nje kaj
 * pomeni. Vrne opozorilo ali `null`, kadar je odjava smiselna.
 *
 * Registracijski obrazec je seznam vseh registriranih članov kluba, zato pri
 * njem opozorila ni. Izvoz iz evidence pa ima stolpec "Tekmovanje" in je lahko
 * seznam prijavljenih v eno samo tekmovanje.
 */
export function opozoriloOObsegu(
  tekmovanja: string[] | undefined,
  format: ImportFormat | undefined,
): string | null {
  if (format !== 'evidenca') return null
  const t = tekmovanja ?? []
  if (t.length === 0) return null
  if (t.length === 1) {
    return `Datoteka zajema samo tekmovanje »${t[0]}«. Odsotnost iz nje pomeni le, ` +
      'da član v to tekmovanje ni prijavljen — ne pa, da ni več registriran pri klubu. ' +
      'Odjavi ga samo, če zares veš, da je klub zapustil.'
  }
  return `Datoteka zajema tekmovanja: ${t.join(', ')}. Preveri, ali res pokriva vse ` +
    'registrirane člane kluba — sicer odsotnost iz nje ne pomeni odhoda iz kluba.'
}
