/**
 * LIGAŠKO DREVO — izbira sezone za vsako raven državnih lig.
 *
 * Vsaka "raven" (slot) v ligaškem drevesu se preslika na konkretno sezono:
 * izbere se najnovejša (najvišje leto); pri istem letu ima prednost aktivna.
 * Ločevanje 1. lige moških in članic poteka po `category`, mladinci po `category`.
 */

/**
 * Mesta v ligaškem drevesu. Vsako mesto dobi NATANKO ENO sezono.
 *
 * NE dodajaj 'obz'. Območnih lig je hkrati več (ena na območno zvezo), zato bi
 * pravilo "ena sezona na mesto" prikazalo samo prvo, ostale pa bi izginile.
 * Obravnava jih `pickObzSeasons()` spodaj.
 */
export type LeagueTreeSlot =
  | 'super_liga'
  | '1_liga'
  | '2_liga_vzhod'
  | '2_liga_zahod'
  | '1_liga_zenske'
  | 'u14'
  | 'u18'

export const LEAGUE_TREE_SLOTS: LeagueTreeSlot[] = [
  'super_liga', '1_liga', '2_liga_vzhod', '2_liga_zahod', '1_liga_zenske', 'u14', 'u18',
]

interface MinSeason {
  id: string
  tier: string | null
  category: string
  year: number
  status: string
}

const SLOT_MATCH: Record<LeagueTreeSlot, (s: MinSeason) => boolean> = {
  super_liga:     s => s.tier === 'super_liga',
  '1_liga':       s => s.tier === '1_liga' && s.category === 'men',
  '2_liga_vzhod': s => s.tier === '2_liga_vzhod',
  '2_liga_zahod': s => s.tier === '2_liga_zahod',
  '1_liga_zenske': s => s.tier === '1_liga' && s.category === 'women',
  u14:            s => s.category === 'u14',
  u18:            s => s.category === 'u18',
}

const activeRank = (status: string) => (status === 'active' ? 1 : 0)

/**
 * Območne lige (tier='obz') NISO mesto v drevesu: hkrati jih je lahko več, ena
 * na območno zvezo (OBZ Postojna, OBZ Ljubljana …). Zato jih ne izbiramo po
 * načelu "ena sezona na mesto", ampak vrnemo vse — urejene po imenu OBZ.
 * Brez tega bi območne lige na javni strani povsem izginile, ker se ta izrisuje
 * izključno iz LEAGUE_TREE_SLOTS.
 */
export function pickObzSeasons<T extends MinSeason & { obz_name?: string | null; name?: string }>(
  seasons: T[],
): T[] {
  return seasons
    .filter(s => s.tier === 'obz')
    .sort((a, b) =>
      (a.obz_name ?? a.name ?? '').localeCompare(b.obz_name ?? b.name ?? '', 'sl') ||
      a.id.localeCompare(b.id),
    )
}

/** Za vsako raven drevesa vrne izbrano sezono (ali null, če je ni). */
export function pickLeagueTreeSeasons<T extends MinSeason>(
  seasons: T[],
): Record<LeagueTreeSlot, T | null> {
  const pick = (match: (s: MinSeason) => boolean): T | null =>
    seasons
      .filter(match)
      .sort(
        (a, b) =>
          b.year - a.year ||
          activeRank(b.status) - activeRank(a.status) ||
          a.id.localeCompare(b.id),
      )[0] ?? null

  const out = {} as Record<LeagueTreeSlot, T | null>
  for (const slot of LEAGUE_TREE_SLOTS) out[slot] = pick(SLOT_MATCH[slot])
  return out
}
