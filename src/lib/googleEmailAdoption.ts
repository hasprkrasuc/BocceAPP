export interface IdentityLike {
  provider: string
  identity_data?: { email?: string } | null
}

export type AdoptionCode = 'brez_google_identitete' | 'brez_google_naslova' | 'naslov_ze_enak'

export type AdoptionResult =
  | { ok: true; email: string }
  | { ok: false; code: AdoptionCode }

// Čista presoja, brez dostopa do baze in omrežja — zato jo je mogoče testirati
// in zato jo Vercel funkcija samo pokliče.
// Preverjanje, ali naslov že pripada DRUGEMU računu, tu ni: zahteva poizvedbo
// v bazo in zato živi v ročevalniku.
export function chooseGoogleEmail(identities: IdentityLike[], currentEmail: string): AdoptionResult {
  const google = identities.find(i => i.provider === 'google')
  if (!google) return { ok: false, code: 'brez_google_identitete' }

  const email = google.identity_data?.email?.trim().toLowerCase()
  if (!email) return { ok: false, code: 'brez_google_naslova' }

  if (email === (currentEmail || '').trim().toLowerCase()) return { ok: false, code: 'naslov_ze_enak' }

  return { ok: true, email }
}
