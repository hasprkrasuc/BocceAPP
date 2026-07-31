// Generični naslovi nastanejo ob uvozu igralcev in niso od nikogar — nihče
// jih ne bere. Zato uporabniku ponudimo zamenjavo za lastnega.
//
// balinar.app je hkrati domena aplikacije. Če bi kdaj obstajal pravi poštni
// predal na tej domeni (npr. info@balinar.app), bi bil tu napačno označen kot
// generičen; ob pisanju (31. 7. 2026) takega računa ni.
export const GENERIC_EMAIL_DOMAINS = ['balinar.app', 'bocceapp.si'] as const

export function isGenericEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const at = email.lastIndexOf('@')
  if (at < 0) return false
  const domain = email.slice(at + 1).toLowerCase()
  return GENERIC_EMAIL_DOMAINS.includes(domain as (typeof GENERIC_EMAIL_DOMAINS)[number])
}
