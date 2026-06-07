/**
 * DVOJNA REGISTRACIJA — engine
 *
 * Pravila:
 * - Igralec star ≤ 23 let
 * - Vsaj 14 nastopov (discipline) v moški konkurenci v tekoči sezoni
 * - Dovoljene kombinacije tier-ov:
 *     super_liga ↔ 1_liga        ✅
 *     super_liga ↔ 2_liga_zahod  ✅
 *     super_liga ↔ 2_liga_vzhod  ✅
 *     1_liga     ↔ 2_liga_*      ❌ (isti termin)
 *     isti tier                  ❌
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
