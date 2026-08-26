/**
 * RAZVRSTITEV KLUBOV PO LIGAH TEKOČE SEZONE
 *
 * Seznam klubov je bil doslej razvrščen po stolpcu `clubs.tier` — ročno
 * vzdrževani vrednosti, ki se ob prestopih ni popravila. Ob pisanju (26. 8. 2026)
 * je bilo napačno uvrščenih 20 klubov od 71, ki igrajo v tekoči sezoni; med njimi
 * sta si Velenje Premogovnik in Planina Ajdovščina mesti kar zamenjala.
 *
 * Odslej se uvrstitev IZPELJE iz tega, kje ima klub ekipo v sezoni, ki ni
 * zaključena. To je mogoče šele, odkar ima `league_teams.club_id` izpolnjenih
 * 275 od 278 ekip; prej povezave preprosto ni bilo.
 *
 * Klub se pojavi v VSAKI ligi, kjer ima ekipo — kdor igra Super ligo in žensko
 * 1. ligo, je v obeh razdelkih. Izbrati eno bi pomenilo drugo zamolčati.
 */

export type Razdelek =
  | 'super_liga' | '1_liga' | '1_liga_clanice'
  | '2_liga_vzhod' | '2_liga_zahod'
  | 'u18' | 'u14' | 'obz' | 'brez'

export const RAZDELKI: { key: Razdelek; label: string }[] = [
  { key: 'super_liga',     label: 'Super liga' },
  { key: '1_liga',         label: '1. liga' },
  { key: '1_liga_clanice', label: '1. liga — članice' },
  { key: '2_liga_vzhod',   label: '2. liga — vzhod' },
  { key: '2_liga_zahod',   label: '2. liga — zahod' },
  { key: 'u18',            label: '1. državna liga U18' },
  { key: 'u14',            label: '1. državna liga U14' },
  { key: 'obz',            label: 'Območne lige' },
  { key: 'brez',           label: 'Brez ekipe v tekoči sezoni' },
]

/**
 * Razdelek za eno sezono. Sam `tier` ne zadošča: mladinski in ženski ligi sta
 * obe zapisani kot `1_liga` in bi brez kategorije pristali med člani.
 */
export function razdelekZaSezono(
  tier: string | null | undefined,
  category: string | null | undefined,
): Razdelek | null {
  if (category === 'u14' || category === 'u15' || category === 'u12') return 'u14'
  if (category === 'u18' || category === 'u18_women') return 'u18'
  if (tier === 'obz') return 'obz'
  if (tier === '1_liga') return category === 'women' ? '1_liga_clanice' : '1_liga'
  if (tier === 'super_liga') return 'super_liga'
  if (tier === '2_liga_vzhod') return '2_liga_vzhod'
  if (tier === '2_liga_zahod') return '2_liga_zahod'
  return null
}

export interface ClanstvoVLigi {
  club_id: string
  tier: string | null
  category: string | null
}

/**
 * Za vsak klub množica razdelkov, v katerih nastopa. Klub brez ekipe v tekoči
 * sezoni dobi 'brez' — ne 'obz', kar bi bila trditev, da igra območno ligo.
 */
export function razdelkiKlubov<T extends { id: string }>(
  klubi: T[],
  clanstva: ClanstvoVLigi[],
): Map<string, Set<Razdelek>> {
  const po = new Map<string, Set<Razdelek>>()
  for (const c of clanstva) {
    const r = razdelekZaSezono(c.tier, c.category)
    if (!r) continue
    if (!po.has(c.club_id)) po.set(c.club_id, new Set())
    po.get(c.club_id)!.add(r)
  }
  for (const k of klubi) {
    if (!po.has(k.id) || po.get(k.id)!.size === 0) po.set(k.id, new Set<Razdelek>(['brez']))
  }
  return po
}

/** Klubi po razdelkih, v vrstnem redu RAZDELKI; prazni razdelki izpadejo. */
export function razvrstiKlube<T extends { id: string }>(
  klubi: T[],
  clanstva: ClanstvoVLigi[],
): { key: Razdelek; label: string; klubi: T[] }[] {
  const po = razdelkiKlubov(klubi, clanstva)
  return RAZDELKI
    .map(({ key, label }) => ({ key, label, klubi: klubi.filter(k => po.get(k.id)?.has(key)) }))
    .filter(r => r.klubi.length > 0)
}
