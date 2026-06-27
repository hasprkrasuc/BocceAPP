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
 * ─── STANJE IMPLEMENTACIJE (TODO) ───────────────────────────────
 * Spodnja koda uveljavlja le MOŠKO pravilo. Znana odstopanja:
 *   1. ŽENSKE: neimplementirano — Profile.tsx in PlayerDetail.tsx
 *      filtrirata samo `category === 'men'`, dodelitev pa je vezana
 *      na drEligible (≤23). Žensk trenutno ni mogoče dvojno registrirati.
 *   2. tiersCompatible() ne uveljavi pogoja "vsaj eden super_liga"
 *      (preverja le, da nista oba nižja tier-a) — glej opombo pri funkciji.
 */

export const DOUBLE_REG_MAX_AGE = 23
// Pogoj nastopov NI več zahteva — samo starost ≤ 23 in različen rang

/** Tier-i ki igrajo ob istem terminu kot 1. liga → dvojna registracija med njimi ni dovoljena */
const LOWER_TIERS = new Set(['1_liga', '2_liga_zahod', '2_liga_vzhod'])

/**
 * Ali sta dva tier-a združljiva za dvojno registracijo?
 * Zahteva: vsaj eden mora biti super_liga, in ne smeta biti oba "lower tier".
 */
export function tiersCompatible(tier1: string, tier2: string): boolean {
  if (!tier1 || !tier2)         return false
  if (tier1 === tier2)           return false
  // 1. liga in 2. liga igrajo ob istem terminu
  if (LOWER_TIERS.has(tier1) && LOWER_TIERS.has(tier2)) return false
  return true
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
  myTeams: { id: string; tier: string }[],
  allTeams: T[],
): T[] {
  const myIds = new Set(myTeams.map(t => t.id))
  if (isFemale(gender)) {
    return allTeams.filter(t => t.category === 'women' && t.tier === '1_liga' && !myIds.has(t.id))
  }
  return allTeams.filter(t =>
    t.category === 'men' && !myIds.has(t.id) &&
    myTeams.some(mt => tiersCompatible(mt.tier, t.tier)))
}

/** Izračun starosti iz datuma rojstva */
export function calcAge(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth) return null
  const dob = new Date(dateOfBirth)
  if (isNaN(dob.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  if (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate())) age--
  return age
}

/** Ali je igralec starostno upravičen (≤ 23 let)? */
export function isAgeEligible(dateOfBirth: string | null | undefined): boolean {
  const age = calcAge(dateOfBirth)
  return age !== null && age <= DOUBLE_REG_MAX_AGE
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
