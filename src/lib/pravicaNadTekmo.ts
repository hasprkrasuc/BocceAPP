/**
 * KDO SME UREJATI LIGAŠKO TEKMO
 *
 * Pravica je v bazi že opisana s politikami: `is_league_admin(season_id)` daje
 * ligaškemu adminu poln dostop do `league_fixtures`, `league_match_results`,
 * `league_match_discipline_results` in `match_cards` svoje sezone. Vmesnik je
 * zaostajal — gledal je samo globalni `isAdmin`, zato ligaški admin ni mogel
 * ne premakniti datuma ne delegirati sodnikov, čeprav mu baza tega ni branila.
 *
 * Ta datoteka ima pravilo na enem mestu, da se zaslon in baza ne razideta.
 */

export interface PravicaVhod {
  /** Globalni admin ali super admin. */
  isAdmin: boolean
  /** Sezone, ki jih uporabnik ureja kot ligaški admin. */
  managedSeasonIds: string[]
  /** Sezona te tekme; dokler se tekma ne naloži, je neznana. */
  seasonId: string | null | undefined
}

/**
 * Ali uporabnik upravlja LIGO te tekme — globalni admin ali ligaški admin
 * prav te sezone. To je pravica za stvari okoli tekme: datum, kraj in
 * delegacija sodnikov.
 */
export function jeAdminTeLige({ isAdmin, managedSeasonIds, seasonId }: PravicaVhod): boolean {
  if (isAdmin) return true
  if (!seasonId) return false
  return managedSeasonIds.includes(seasonId)
}

/**
 * Ali uporabnik sme urejati zapisnik: kdor upravlja ligo, ali glavni sodnik
 * te tekme. Glavni sodnik ureja samo svojo tekmo, ligo pa ne.
 */
export function smeUrejatiZapisnik(
  vhod: PravicaVhod & {
    userId: string | null | undefined
    chiefJudgeId: string | null | undefined
  },
): boolean {
  if (jeAdminTeLige(vhod)) return true
  return !!vhod.userId && vhod.userId === vhod.chiefJudgeId
}
