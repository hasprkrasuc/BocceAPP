/**
 * PRIJAVNI PODATKI UPORABNIKA — ponastavitev gesla in sprememba naslova
 *
 * Obe dejanji sta v isti datoteki namenoma: delita natanko isto avtorizacijo.
 * Ločeni datoteki bi pomenili dve kopiji straže, ta pa se prej ali slej
 * razideta — in tu bi razhajanje pomenilo prevzem tujega računa.
 *
 * Zakaj prek strežnika: geslo in prijavni naslov živita v `auth.users`, kamor
 * odjemalec ne more pisati niti s pravicami admina. Potrebna je storitvena
 * vloga (service role).
 *
 * STRAŽA: klicatelj mora biti admin. Kadar je TARČA admin ali super_admin, mora
 * biti klicatelj super_admin — sicer bi lahko katerikoli admin prevzel račun
 * kateregakoli drugega, vključno z lastnikom projekta.
 *
 * Geslo se vrne ENKRAT in nikamor ne shrani. Obstoječega gesla ni mogoče
 * prebrati — v bazi je le zgoščena vrednost — zato ga tudi admin nikoli ne vidi.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

const URL = process.env.SUPABASE_URL as string
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string

/**
 * Abeceda brez znakov, ki se ob nareku ali prepisu zamenjujejo: I, l, O, 0, 1.
 * Dolžina je 32, bajt pa ima 256 vrednosti — 256/32 je celo število, zato
 * `bajt % 32` ne daje nobenemu znaku večje verjetnosti.
 */
const ABECEDA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ZNAKOV = 15

/** Naključno geslo v treh skupinah po pet znakov — da ga je mogoče narekovati. */
function ustvariGeslo(): string {
  const znaki = [...randomBytes(ZNAKOV)].map(b => ABECEDA[b % ABECEDA.length])
  return [0, 5, 10].map(i => znaki.slice(i, i + 5).join('')).join('-')
}

const jeVeljavenNaslov = (e: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)

interface Zahteva {
  action: 'reset-password' | 'set-email'
  userId: string
  /** Samo pri 'set-email'. */
  email?: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!URL || !SERVICE_KEY) return res.status(500).json({ error: 'Manjkata SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' })

  const admin = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

  // --- Avtorizacija klicatelja ---
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Manjka avtorizacija' })
  const { data: userData, error: uErr } = await admin.auth.getUser(token)
  if (uErr || !userData.user) return res.status(401).json({ error: 'Neveljavna seja' })
  const { data: me } = await admin.from('users').select('role').eq('id', userData.user.id).single()
  const mojaVloga = me?.role as string | undefined
  if (!mojaVloga || !['admin', 'super_admin'].includes(mojaVloga)) {
    return res.status(403).json({ error: 'Ni administrator' })
  }

  const body = req.body as Zahteva
  if (!body || typeof body.userId !== 'string' || !body.userId) {
    return res.status(400).json({ error: 'Napačna vsebina zahteve' })
  }
  if (body.action !== 'reset-password' && body.action !== 'set-email') {
    return res.status(400).json({ error: 'Neznano dejanje' })
  }

  try {
    const { data: cilj, error: cErr } = await admin
      .from('users').select('id, full_name, role, email').eq('id', body.userId).maybeSingle()
    if (cErr) throw new Error(`Branje uporabnika: ${cErr.message}`)
    if (!cilj) return res.status(404).json({ error: 'Uporabnika ni v bazi' })

    // Tarča z admin pravicami: samo super_admin.
    const ciljnaVloga = cilj.role as string
    if (['admin', 'super_admin'].includes(ciljnaVloga) && mojaVloga !== 'super_admin') {
      return res.status(403).json({
        error: 'Geslo in prijavni naslov administratorja lahko spremeni samo super administrator',
      })
    }

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

    // --- reset-password ---
    const geslo = ustvariGeslo()
    const { error: aErr } = await admin.auth.admin.updateUserById(body.userId, { password: geslo })
    if (aErr) throw new Error(`Nastavitev gesla: ${aErr.message}`)

    // Zastavica poskrbi, da si geslo nastavi uporabnik sam — tisto, ki ga je
    // videl admin, velja samo do prve prijave.
    const { error: fErr } = await admin
      .from('users').update({ must_change_password: true }).eq('id', body.userId)
    if (fErr) throw new Error(`Oznaka za obvezno spremembo gesla: ${fErr.message}`)

    return res.status(200).json({ password: geslo, name: cilj.full_name })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}
