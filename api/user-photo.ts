/**
 * FOTOGRAFIJA UPORABNIKA — nastavitev in odstranitev (admin)
 *
 * Zakaj prek strežnika: RLS na `public.users` dovoli UPDATE samo po LASTNI
 * vrstici ("Lastni profil": id = auth.uid()). Admin torej tuje fotografije ne
 * more zapisati iz vmesnika — poizvedba bi tiho ujela nič vrstic, tako kot se
 * je nekoč dogajalo pri vlogah (od tam `set_user_role`).
 *
 * Nalaganje same datoteke ostane v brskalniku: vedro `media` je odprto za
 * pisanje adminom (glej SETUP.md), tu se zapiše samo naslov.
 *
 * Sprejmemo LE naslov iz lastnega Storagea. Zunanja povezava bi pomenila, da
 * aplikacija na profilu prikazuje sliko s tujega strežnika — ta lahko kadarkoli
 * izgine ali se zamenja, obiskovalčev brskalnik pa bi tujemu gostitelju razkril
 * IP ob vsakem ogledu.
 *
 * `null` pomeni odstranitev fotografije; datoteka v vedru ostane.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL as string
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string

/**
 * Oblika zahteve. Namenoma zapisana tu in ne v src/: Vercel zapakira samo
 * `api/`, zato strežniška funkcija iz `src/` ne sme uvažati vrednosti
 * (ERR_MODULE_NOT_FOUND).
 */
interface UserPhotoRequest {
  userId: string
  /** Javni naslov iz Storagea; `null` odstrani fotografijo. */
  photoUrl: string | null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!URL || !SERVICE_KEY) return res.status(500).json({ error: 'Manjkata SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' })

  const admin = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

  // --- Avtorizacija: klicatelj mora biti admin ---
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Manjka avtorizacija' })
  const { data: userData, error: uErr } = await admin.auth.getUser(token)
  if (uErr || !userData.user) return res.status(401).json({ error: 'Neveljavna seja' })
  const { data: me } = await admin.from('users').select('role').eq('id', userData.user.id).single()
  if (!me || !['admin', 'super_admin'].includes(me.role as string)) return res.status(403).json({ error: 'Ni administrator' })

  const body = req.body as UserPhotoRequest
  if (!body || typeof body.userId !== 'string' || !body.userId || body.photoUrl === undefined) {
    return res.status(400).json({ error: 'Napačna vsebina zahteve' })
  }

  const dovoljenaPredpona = `${URL.replace(/\/+$/, '')}/storage/v1/object/public/`
  if (body.photoUrl !== null && !body.photoUrl.startsWith(dovoljenaPredpona)) {
    return res.status(400).json({ error: 'Fotografija mora biti naložena v aplikacijo, zunanje povezave niso dovoljene' })
  }

  try {
    const { data: cilj, error: readErr } = await admin
      .from('users').select('id, full_name').eq('id', body.userId).maybeSingle()
    if (readErr) throw new Error(`Branje uporabnika: ${readErr.message}`)
    if (!cilj) return res.status(404).json({ error: 'Uporabnika ni v bazi' })

    const { error: upErr } = await admin
      .from('users').update({ photo_url: body.photoUrl }).eq('id', body.userId)
    if (upErr) throw new Error(`Shranjevanje fotografije: ${upErr.message}`)

    return res.status(200).json({ photoUrl: body.photoUrl, name: cilj.full_name })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}
