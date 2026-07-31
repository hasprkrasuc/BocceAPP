import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

// Podvojeno iz src/lib/googleEmailAdoption.ts — api/ ne sme uvažati iz src/
// (Vercel zapakira le api/). Sinhronizacijo varuje src/lib/adoptGoogleEmailApiSync.test.ts.
interface IdentityLike {
  provider: string
  identity_data?: { email?: string } | null
}
type AdoptionCode = 'brez_google_identitete' | 'brez_google_naslova' | 'naslov_ze_enak'
type AdoptionResult = { ok: true; email: string } | { ok: false; code: AdoptionCode }

function chooseGoogleEmail(identities: IdentityLike[], currentEmail: string): AdoptionResult {
  const google = identities.find(i => i.provider === 'google')
  if (!google) return { ok: false, code: 'brez_google_identitete' }

  const email = google.identity_data?.email?.trim().toLowerCase()
  if (!email) return { ok: false, code: 'brez_google_naslova' }

  if (email === (currentEmail || '').trim().toLowerCase()) return { ok: false, code: 'naslov_ze_enak' }

  return { ok: true, email }
}

const SPOROCILA: Record<AdoptionCode, string> = {
  brez_google_identitete: 'Google račun ni povezan s tem računom.',
  brez_google_naslova: 'Google ni vrnil e-naslova.',
  naslov_ze_enak: 'Račun že uporablja ta naslov.',
}

const URL = process.env.SUPABASE_URL as string
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!URL || !SERVICE_KEY) return res.status(500).json({ error: 'Manjkata SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' })

  const admin = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

  // Funkcija spreminja IZKLJUČNO naslov klicatelja — ciljnega uporabnika ne
  // sprejema iz zahteve, ampak ga vzame iz žetona. Zato ni potrebna vloga admina.
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Manjka avtorizacija' })

  const { data: userData, error: uErr } = await admin.auth.getUser(token)
  if (uErr || !userData.user) return res.status(401).json({ error: 'Neveljavna seja' })
  const me = userData.user

  const odlocitev = chooseGoogleEmail(
    (me.identities ?? []) as IdentityLike[],
    me.email ?? '',
  )
  if (!odlocitev.ok) return res.status(400).json({ error: SPOROCILA[odlocitev.code], code: odlocitev.code })

  // Naslov ne sme pripadati drugemu računu — natanko tak položaj je ustvaril
  // podvojene račune, ki smo jih 31. 7. 2026 ročno združevali.
  const { data: zaseden, error: zErr } = await admin
    .from('users').select('id').ilike('email', odlocitev.email).maybeSingle()
  if (zErr) return res.status(500).json({ error: `Napaka pri preverjanju naslova: ${zErr.message}` })
  if (zaseden && zaseden.id !== me.id) {
    return res.status(409).json({
      error: 'Ta e-naslov že uporablja drug račun. Obrni se na administratorja, da računa združi.',
      code: 'naslov_zaseden',
    })
  }

  // email_confirm: true — naslov je z Google prijavo že dokazan, zato
  // potrditveno pismo ni potrebno. Ta pot torej ne pošlje nobenega pisma.
  const { error: aErr } = await admin.auth.admin.updateUserById(me.id, {
    email: odlocitev.email,
    email_confirm: true,
  })
  if (aErr) return res.status(500).json({ error: `Napaka pri zamenjavi naslova: ${aErr.message}` })

  // Trigger on_auth_user_email_changed poskrbi tudi za public.users.email,
  // a ga zapišemo izrecno, da odziv ne visi na vrstnem redu izvajanja.
  const { error: pErr } = await admin.from('users').update({ email: odlocitev.email }).eq('id', me.id)
  if (pErr) return res.status(500).json({ error: `Naslov zamenjan, profil ni osvežen: ${pErr.message}` })

  return res.status(200).json({ email: odlocitev.email })
}
