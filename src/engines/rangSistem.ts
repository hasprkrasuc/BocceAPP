/**
 * KATERA TEKMOVANJA ŠTEJEJO V RANG SISTEM.
 *
 * Rang lestvica in igralčeva statistika sta na ŠTIRIH mestih vsaka zase
 * odločali, katere sezone upoštevata, in vsaka je pogoj napisala po svoje
 * (`.neq('format','turnir')` na enem, `s.format !== 'turnir'` na drugem,
 * dvojni `.neq` na tretjem, nobenega na četrtem). Ko je prišel nov format, se
 * je bilo treba spomniti vseh štirih — in prav na enem se ni.
 *
 * Zato en sam odgovor tu.
 *
 *   - `turnir`      — ekipni turnirji reprezentanc (Turnir štirih nacij).
 *                     Niso del slovenskega tekmovalnega sistema.
 *   - `super_pokal` — ena sama tekma na leto med pokalnim prvakom in prvakom
 *                     Super lige. Z eno tekmo bi igralec dobil ligaški rang s
 *                     koeficientom 1,0 in povrhu pokalne uvrstitvene točke,
 *                     kar bi lestvico popačilo bolj, kot je tekma vredna.
 *   - `pokal`       — ŠTEJE, namenoma. Pokal BZS je redno tekmovanje s
 *                     koeficientom 1,0 (glej LIGA_KOEF.pokal).
 *
 * Če bi zveza kdaj odločila, da Super Pokal v rang šteje, je to ena vrstica
 * tu in nikjer drugje.
 */

/** Formati sezon, ki v rang sistem NE štejejo. */
export const FORMATI_BREZ_RANGA = ['turnir', 'super_pokal'] as const

/**
 * Ali sezona tega formata šteje v rang lestvico in igralčevo rang statistiko.
 *
 * Neznan ali manjkajoč format šteje (privzetek je »navadna liga«), ker so
 * starejše vrstice nastale, preden je stolpec obstajal.
 */
export function steVRangSistem(format: string | null | undefined): boolean {
  if (!format) return true
  return !(FORMATI_BREZ_RANGA as readonly string[]).includes(format)
}

/** Formati, ki niso liga — nimajo lestvice ne kolobarja in imajo svojo stran. */
export const FORMATI_NI_LIGA = ['pokal', 'super_pokal', 'turnir'] as const

/** Ali je sezona tega formata navadna liga (ima lestvico in razpored kol). */
export function jeLigaskiFormat(format: string | null | undefined): boolean {
  if (!format) return true
  return !(FORMATI_NI_LIGA as readonly string[]).includes(format)
}

/** Ali je sezona pokalnega tipa — izrisuje se na /pokal, ne na /liga. */
export function jePokalniFormat(format: string | null | undefined): boolean {
  return format === 'pokal' || format === 'super_pokal'
}
