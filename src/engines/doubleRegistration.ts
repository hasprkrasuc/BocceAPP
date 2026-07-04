/**
 * DVOJNA REGISTRACIJA — engine
 *
 * MOŠKI:
 * - Igralec star ≤ 23 let
 * - Dovoljene kombinacije tier-ov:
 *     super_liga ↔ 1_liga        ✅
 *     super_liga ↔ 2_liga_zahod  ✅
 *     super_liga ↔ 2_liga_vzhod  ✅
 *     1_liga     ↔ 2_liga_*      ❌ (isti termin)
 *     isti tier                  ❌
 *
 * ŽENSKE:
 * - Brez starostne omejitve
 * - Brez tier omejitve — pogosto klub nima ženske ekipe v ligi,
 *   zato igralka nastopa za drug klub (npr. Skala Sežana → ŽBK Hrast)
 * - Admin direktno dodeli
 *
 * ─── STANJE IMPLEMENTACIJE ──────────────────────────────────────
 * Implementirano: moško pravilo (teamsCompatible po terminskih skupinah —
 * youth/super/lower), ženska pot (eligibleSecondaryTeams → samo 1. liga
 * članice; primaryTeams → katerakoli njena ekipa), in TROJNA registracija
 * mladincev: primaryTeams za moške šteje tudi mladinske (U-18/U-14) ekipe,
 * eligibleSecondaryTeams pa dovoli člansko ekipo, združljivo z VSEMI trenutnimi
 * ekipami → mladinec = U-18/U-14 + Super liga + ena nižja liga.
 */

export const DOUBLE_REG_MAX_AGE = 23
// Pogoj nastopov NI več zahteva — samo starost ≤ 23 in različen rang

/** Mladinske kategorije po starosti (za "igro navzgor": U-14 lahko igra U-18). */
const YOUTH_ORDER: Record<string, number> = { u12: 0, u14: 1, u15: 2, u18: 3 }
export function youthLevel(category: string | null | undefined): number | null {
  const c = category ?? ''
  return c in YOUTH_ORDER ? YOUTH_ORDER[c] : null
}

/**
 * Terminska skupina ekipe za hkratno registracijo:
 *   'youth' = mladinske lige (U-12/U-14/U-15/U-18, tier null)
 *   'super' = Super liga
 *   'lower' = 1. liga in 2. liga (igrajo ob istem terminu)
 */
export type TerminGroup = 'youth' | 'super' | 'lower'
export function terminGroup(
  category: string | null | undefined,
  tier: string | null | undefined,
): TerminGroup | null {
  if (youthLevel(category) !== null) return 'youth'
  if (tier === 'super_liga') return 'super'
  if (tier === '1_liga' || tier === '2_liga_zahod' || tier === '2_liga_vzhod') return 'lower'
  return null
}

/**
 * Ali sta ekipi iz RAZLIČNIH terminskih skupin (dovoljena hkratna registracija)?
 * youth↔super, youth↔lower, super↔lower ✅ · lower↔lower, ista skupina ❌.
 * Dve MLADINSKI ekipi sta združljivi le, če sta RAZLIČNI kategoriji (U-14 + U-18 =
 * igra navzgor); ista mladinska kategorija ❌.
 */
export function teamsCompatible(
  a: { category?: string | null; tier?: string | null },
  b: { category?: string | null; tier?: string | null },
): boolean {
  const ga = terminGroup(a.category, a.tier)
  const gb = terminGroup(b.category, b.tier)
  if (ga === null || gb === null) return false
  if (ga === 'youth' && gb === 'youth') return (a.category ?? '') !== (b.category ?? '')
  return ga !== gb
}

/** Ali je igralec/ka ženskega spola? (shranjeni gender: 'Ž' / 'M') */
export function isFemale(gender: string | null | undefined): boolean {
  if (!gender) return false
  const g = gender.trim().toLowerCase()
  return g === 'ž' || g === 'z' || g === 'f' || g === 'w'
      || g.startsWith('žen') || g.startsWith('zen') || g === 'female'
}

export interface DRTeamRef { id: string; tier: string; category: string }

/**
 * Ekipe, v katere je dovoljena dvojna registracija (sekundarna ekipa).
 * - MOŠKI:  druga moška ekipa združljivega ranga (tiersCompatible)
 * - ŽENSKE: samo 1. liga – članice (category 'women', tier '1_liga')
 * Starostni pogoj (≤23) se preverja ločeno z isAgeEligible — velja za oba spola.
 * Ekipe, kjer je igralec/ka že vpisan/a, so izločene.
 */
export function eligibleSecondaryTeams<T extends DRTeamRef>(
  gender: string | null | undefined,
  myTeams: { id: string; tier?: string | null; category?: string | null }[],
  allTeams: T[],
): T[] {
  const myIds = new Set(myTeams.map(t => t.id))
  if (isFemale(gender)) {
    return allTeams.filter(t => t.category === 'women' && t.tier === '1_liga' && !myIds.has(t.id))
  }
  // MOŠKI + mladinci. Sekundarna je lahko:
  //  - članska ekipa, terminsko združljiva z VSEMI trenutnimi (U-18/U-14 + Super + ena nižja);
  //  - mladinska ekipa VIŠJE kategorije od matične (igra navzgor, npr. U-14 → U-18).
  const myYouth = myTeams.map(mt => youthLevel(mt.category)).filter((n): n is number => n !== null)
  const myYouthLevel = myYouth.length ? Math.min(...myYouth) : null
  return allTeams.filter(t => {
    if (myIds.has(t.id) || myTeams.length === 0) return false
    if (t.category === 'men') return myTeams.every(mt => teamsCompatible(mt, t))
    const tl = youthLevel(t.category)
    if (tl !== null) return myYouthLevel !== null && tl > myYouthLevel && myTeams.every(mt => teamsCompatible(mt, t))
    return false
  })
}

/**
 * Prebere datum rojstva v Date. Podpira ISO (YYYY-MM-DD) in BZS pikčasti
 * zapis (D.M.YYYY / DD.MM.YYYY) — new Date() bi slednjega narobe prebral
 * kot ameriški M.D.YYYY ali ga zavrnil.
 */
function parseDob(dateOfBirth: string): Date | null {
  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(dateOfBirth.trim())
  if (dotted) {
    const [, d, m, y] = dotted.map(Number)
    const date = new Date(y, m - 1, d)
    // zavrni neveljavne komponente (npr. 31.2.), ki bi jih Date tiho "prenesel"
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null
    return date
  }
  const date = new Date(dateOfBirth)
  return isNaN(date.getTime()) ? null : date
}

/** Izračun starosti iz datuma rojstva (ISO ali pikčasti BZS zapis) */
export function calcAge(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth) return null
  const dob = parseDob(dateOfBirth)
  if (!dob) return null
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  if (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate())) age--
  return age
}

type SeasonRef = { year: number; category?: string; tier?: string | null } | null

/**
 * Obdrži le ekipe iz NAJNOVEJŠE sezone znotraj svoje kategorije+tier-a — ne
 * glede na status sezone (tudi zaključene). Dvojna registracija mora biti
 * mogoča tudi, ko je aktualna sezona že zaključena. Ključ vključuje tier,
 * da nova sezona enega ranga (npr. Super liga 2026/27) ne izloči še tekočih
 * sezon drugih rangov iste kategorije (1./2. liga 2025/26).
 */
export function latestSeasonsOnly<T extends { season?: SeasonRef }>(teams: T[]): T[] {
  const key = (s: NonNullable<SeasonRef>) => `${s.category ?? ''}|${s.tier ?? ''}`
  const maxByKey = new Map<string, number>()
  for (const t of teams) {
    if (!t.season) continue
    const k = key(t.season)
    const cur = maxByKey.get(k)
    if (cur === undefined || t.season.year > cur) maxByKey.set(k, t.season.year)
  }
  return teams.filter(t => t.season && t.season.year === maxByKey.get(key(t.season)))
}

/**
 * Ekipe, ki lahko služijo kot PRIMARNA (matična) ekipa za dvojno registracijo.
 * - MOŠKI:  samo moške ekipe (tiersCompatible nato omeji kombinacije rangov).
 * - ŽENSKE: katerakoli njena ekipa — tudi U18/U14, ker klub pogosto nima
 *   ženske ekipe (npr. mladinka, ki igra le v ligi U18, se dvojno registrira
 *   v 1. ligo – članice).
 */
export function primaryTeams<T extends { season?: SeasonRef }>(
  gender: string | null | undefined,
  teams: T[],
): T[] {
  if (isFemale(gender)) return teams.filter(t => !!t.season)
  // MOŠKI: moške ekipe + mladinske (u12/u14/u15/u18) — mladinec se dvojno/trojno
  // registrira iz svoje matične mladinske ekipe v članske lige ali višjo mladinsko.
  return teams.filter(t => {
    const c = t.season?.category
    return c === 'men' || youthLevel(c) !== null
  })
}

/** Letnica rojstva za prikaz (ISO ali pikčasti BZS zapis; slice(0,4) bi pikčaste pokvaril). */
export function birthYearOf(dateOfBirth: string | null | undefined): string | null {
  if (!dateOfBirth) return null
  const dob = parseDob(dateOfBirth)
  return dob ? String(dob.getFullYear()) : null
}

/** Začetno leto sezone iz imena ("2025/26" → 2025). */
export function seasonStartYear(seasonName: string | null | undefined): number | null {
  const m = /(\d{4})/.exec(seasonName ?? '')
  return m ? parseInt(m[1], 10) : null
}

/**
 * Ali je igralec starostno upravičen do dvojne registracije?
 * Pravilo je po LETNIKU glede na sezono: (začetno leto sezone − letnica rojstva) ≤ 23.
 * Npr. sezona 2025/26 (začetek 2025) → letniki ≥ 2002 so še upravičeni.
 * Če referenčno leto ni podano, se uporabi tekoče koledarsko leto.
 */
export function isAgeEligible(
  dateOfBirth: string | null | undefined,
  refYear?: number | null,
): boolean {
  if (!dateOfBirth) return false
  const dob = parseDob(dateOfBirth)
  if (!dob) return false
  const year = refYear ?? new Date().getFullYear()
  return year - dob.getFullYear() <= DOUBLE_REG_MAX_AGE
}

/** Prikaz tier-a za UI */
export const DR_TIER_LABELS: Record<string, string> = {
  super_liga:      'Super liga',
  '1_liga':        '1. liga',
  '2_liga_zahod':  '2. liga zahod',
  '2_liga_vzhod':  '2. liga vzhod',
}

/** Status badge barve */
export const DR_STATUS_COLORS: Record<string, string> = {
  pending:  'bg-yellow-50 text-yellow-700 border-yellow-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-600 border-red-200',
}

export const DR_STATUS_LABELS: Record<string, string> = {
  pending:  'V obravnavi',
  approved: 'Odobreno',
  rejected: 'Zavrnjeno',
}
