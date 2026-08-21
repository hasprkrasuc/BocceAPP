/**
 * LETNICA SEZONE — kaj sodi v `league_seasons.year`
 *
 * Stolpec `year` ni okras: po njem se odloča, katera sezona je "najnovejša"
 * (glej latestSeasonsOnly v doubleRegistration.ts), po njem se razvrščajo
 * ligaška pot, rang lestvica in ligaško drevo.
 *
 * V bazi sta se uveljavili DVE navadi in obe sta dosledni znotraj svoje veje:
 *
 *   moške članske lige   → KONČNO leto sezone   ("2024/25" → 2025)
 *   ženske in mladinske  → ZAČETNO leto sezone  ("2024/25" → 2024)
 *
 * Razlike ne poravnavamo za nazaj: latestSeasonsOnly primerja letnice le
 * znotraj istega para kategorija+rang, zato se navadi nikoli ne srečata.
 *
 * 21. 8. 2026 so vse nove sezone 2026/27 dobile letnico 2026 — pri moških
 * ligah torej ZAČETNO leto, čeprav je pri njih doslej veljalo končno. Posledica
 * je bila, da aplikacija sezone 2026/27 ni ločila od 2025/26: obe sta bili
 * "najnovejši", igralčeva lanska ekipa je štela kot tekoča in dvojne
 * registracije v 1. ligo ni bilo mogoče dodati.
 *
 * Ta modul obstaja, da obrazec za sezono na to opozori, preden se ponovi.
 */

/** Iz imena prebere oznako sezone ("2026/27") in vrne začetno leto. */
export function zacetnoLetoIzImena(seasonName: string | null | undefined): number | null {
  const m = /(\d{4})\/(\d{2,4})/.exec(seasonName ?? '')
  return m ? parseInt(m[1], 10) : null
}

/**
 * Pričakovana letnica za dano ime in kategorijo, ali null, kadar imena ni
 * mogoče prebrati (sezona brez oznake "2026/27" — takrat ne opozarjamo).
 */
export function pricakovanaLetnicaSezone(
  seasonName: string | null | undefined,
  category: string | null | undefined,
): number | null {
  const zacetek = zacetnoLetoIzImena(seasonName)
  if (zacetek === null) return null
  return category === 'men' ? zacetek + 1 : zacetek
}

/**
 * Opozorilo za obrazec, ali nič, kadar je vnos v redu. Namenoma ne blokira:
 * izjeme obstajajo in admin mora imeti zadnjo besedo.
 */
export function opozoriloOLetnici(
  seasonName: string | null | undefined,
  category: string | null | undefined,
  year: number | null | undefined,
): string | null {
  const pricakovana = pricakovanaLetnicaSezone(seasonName, category)
  if (pricakovana === null || year === null || year === undefined) return null
  if (year === pricakovana) return null
  const navada = category === 'men' ? 'končno' : 'začetno'
  return `Sezone te kategorije vodijo ${navada} leto sezone — po imenu bi pričakoval ${pricakovana}, vpisano je ${year}. ` +
    'Neujemanje pomeni, da aplikacija nove sezone ne bo ločila od prejšnje.'
}
