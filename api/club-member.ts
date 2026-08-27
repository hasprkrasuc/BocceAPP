/**
 * ČLAN KLUBA — dejanja, ki jih sme opraviti klubski skrbnik
 *
 * Od 1446 uporabnikov jih ima 1413 naslov, ki ga je dodelila aplikacija ob
 * uvozu in ne prejema pošte; prijavilo se je 15 ljudi. Naslovov igralcev zveza
 * nima, imajo pa jih klubi. Ta pot omogoči klubskemu tajniku, da svojim članom
 * vpiše prave naslove in jim izroči začetno geslo — brez tega igralci v
 * aplikacijo sploh ne morejo.
 *
 * STRAŽA je v treh plasteh in vsaka mora držati sama zase:
 *
 *   1. Klicatelj je globalni admin ALI skrbnik kluba, v katerem je tarča.
 *      Skrbništvo se preveri proti KLUBU TARČE, ne proti kateremukoli klubu
 *      klicatelja — sicer bi skrbnik enega kluba dosegel člane vseh.
 *   2. Tarča ne sme imeti vloge admin ali super_admin. Sicer bi klubski tajnik
 *      lahko prevzel račun lastnika projekta, če bi ta bil član njegovega
 *      kluba. Takim računom ureja prijavo samo super admin prek
 *      api/user-credentials.ts.
 *   3. Dovoljena so SAMO štiri dejanja spodaj. Vloge, EMŠO, datuma rojstva,
 *      licence in članstva v klubu ta pot ne more spremeniti — teh polj sploh
 *      ne zapiše.
 *
 * Zakaj prek strežnika: e-naslov in geslo živita v `auth.users`, kamor
 * odjemalec ne more pisati; telefon in fotografija pa sta na `users`, kjer RLS
 * pisanje omeji na lastno vrstico.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

const URL = process.env.SUPABASE_URL as string
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string

/**
 * KOPIJA iz api/user-credentials.ts — api/ ne sme uvažati iz src/, med seboj pa
 * datotek namenoma ne povezujemo, ker Vercel vsako zapakira posebej. Ujemanje
 * varuje test src/lib/klubskiSkrbnik.sync.test.ts; ob spremembi popravi obe.
 */
const ABECEDA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ZNAKOV = 15

function ustvariGeslo(): string {
  const znaki = [...randomBytes(ZNAKOV)].map(b => ABECEDA[b % ABECEDA.length])
  return [0, 5, 10].map(i => znaki.slice(i, i + 5).join('')).join('-')
}

const jeVeljavenNaslov = (e: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)

/** Naslov v javnem vedru Storage tega projekta — enako kot api/user-photo.ts. */
const jeNasStorage = (u: string): boolean =>
  u.startsWith(`${URL}/storage/v1/object/public/`)

interface Zahteva {
  action: 'set-email' | 'reset-password' | 'set-phone' | 'set-photo'
  userId: string
  email?: string
  phone?: string | null
  photoUrl?: string | null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!URL || !SERVICE_KEY) return res.status(500).json({ error: 'Manjkata SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' })

  const admin = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Manjka avtorizacija' })
  const { data: userData, error: uErr } = await admin.auth.getUser(token)
  if (uErr || !userData.user) return res.status(401).json({ error: 'Neveljavna seja' })

  const body = req.body as Zahteva
  if (!body || typeof body.userId !== 'string' || !body.userId) {
    return res.status(400).json({ error: 'Napačna vsebina zahteve' })
  }
  const DEJANJA = ['set-email', 'reset-password', 'set-phone', 'set-photo']
  if (!DEJANJA.includes(body.action)) return res.status(400).json({ error: 'Neznano dejanje' })

  try {
    const { data: jaz } = await admin
      .from('users').select('role').eq('id', userData.user.id).maybeSingle()
    const globalniAdmin = ['admin', 'super_admin'].includes((jaz?.role as string) ?? '')

    const { data: cilj, error: cErr } = await admin
      .from('users').select('id, full_name, role, club_id').eq('id', body.userId).maybeSingle()
    if (cErr) throw new Error(`Branje člana: ${cErr.message}`)
    if (!cilj) return res.status(404).json({ error: 'Uporabnika ni v bazi' })

    // --- Plast 1: skrbništvo se preveri proti klubu TARČE ---
    if (!globalniAdmin) {
      if (!cilj.club_id) {
        return res.status(403).json({ error: 'Ta uporabnik ni član nobenega kluba' })
      }
      const { data: vloga } = await admin
        .from('club_admins').select('club_id')
        .eq('user_id', userData.user.id).eq('club_id', cilj.club_id).maybeSingle()
      if (!vloga) {
        return res.status(403).json({ error: 'Nisi skrbnik kluba, v katerem je ta uporabnik' })
      }
    }

    // --- Plast 2: skrbniških računov klubski skrbnik ne sme doseči ---
    if (!globalniAdmin && ['admin', 'super_admin'].includes((cilj.role as string) ?? '')) {
      return res.status(403).json({
        error: 'Ta uporabnik ima administratorske pravice; njegovo prijavo ureja samo super administrator',
      })
    }

    // --- Plast 3: samo štiri dejanja ---
    if (body.action === 'set-email') {
      const naslov = (body.email ?? '').trim().toLowerCase()
      if (!jeVeljavenNaslov(naslov)) return res.status(400).json({ error: 'Neveljaven e-naslov' })

      // email_confirm: naslov potrdimo takoj. Potrditveno sporočilo bi šlo na NOV
      // naslov, sprememba pa bi do klika visela — pri človeku, ki se prav zato ne
      // more prijaviti, je to slepa ulica.
      const { error: aErr } = await admin.auth.admin.updateUserById(body.userId, {
        email: naslov, email_confirm: true,
      })
      if (aErr) {
        const zaseden = /already|duplicate|registered/i.test(aErr.message)
        return res.status(zaseden ? 409 : 500).json({
          error: zaseden ? 'Ta e-naslov že uporablja drug račun' : `Sprememba naslova: ${aErr.message}`,
        })
      }
      const { error: pErr } = await admin.from('users').update({ email: naslov }).eq('id', body.userId)
      if (pErr) throw new Error(`Zapis naslova v profil: ${pErr.message}`)
      return res.status(200).json({ email: naslov, name: cilj.full_name })
    }

    if (body.action === 'reset-password') {
      const geslo = ustvariGeslo()
      const { error: aErr } = await admin.auth.admin.updateUserById(body.userId, { password: geslo })
      if (aErr) throw new Error(`Nastavitev gesla: ${aErr.message}`)
      const { error: fErr } = await admin
        .from('users').update({ must_change_password: true }).eq('id', body.userId)
      if (fErr) throw new Error(`Oznaka za obvezno spremembo gesla: ${fErr.message}`)
      return res.status(200).json({ password: geslo, name: cilj.full_name })
    }

    if (body.action === 'set-phone') {
      const tel = (body.phone ?? '').trim()
      const { error } = await admin
        .from('users').update({ phone: tel || null }).eq('id', body.userId)
      if (error) throw new Error(`Zapis telefona: ${error.message}`)
      return res.status(200).json({ phone: tel || null, name: cilj.full_name })
    }

    // set-photo
    const url = body.photoUrl ?? null
    if (url !== null && !jeNasStorage(url)) {
      return res.status(400).json({ error: 'Naslov fotografije ni iz shrambe te aplikacije' })
    }
    const { error } = await admin.from('users').update({ photo_url: url }).eq('id', body.userId)
    if (error) throw new Error(`Zapis fotografije: ${error.message}`)
    return res.status(200).json({ photoUrl: url, name: cilj.full_name })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}
