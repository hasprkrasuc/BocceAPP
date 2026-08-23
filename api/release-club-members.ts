/**
 * ODJAVA ČLANOV IZ KLUBA
 *
 * Počisti `users.club_id` in `users.club` izbranim igralcem. Uporablja se po
 * uvozu seznama za novo sezono, ko admin izrecno potrdi, koga odjavlja.
 *
 * Namenoma LOČENO od /api/import-players: odjava se nikoli ne sme zgoditi kot
 * stranski učinek uvoza. Ena nepopolna datoteka bi sicer izpraznila pol kluba.
 *
 * Strežnik je meja zaupanja in odjavi samo igralce, ki so RES v podanem klubu.
 * Brez te straže bi napaka v vmesniku (ali klic mimo njega) lahko odjavila
 * kogarkoli.
 *
 * Zgodovine članstva baza ne vodi, zato je odjava nepovratna v tem smislu, da
 * se prejšnji klub nikamor ne shrani. Poročilo zato vrne imena odjavljenih —
 * to je edini zapis o dejanju.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import type { ReleaseRequest, ReleaseReport } from '../src/lib/playerImport/types'

const URL = process.env.SUPABASE_URL as string
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string

/** Zgornja meja na zahtevo — odjava celotne baze naenkrat ni legitimen primer. */
const NAJVEC_NA_ZAHTEVO = 500

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

  const body = req.body as ReleaseRequest
  if (!body?.clubId || !Array.isArray(body.playerIds)) {
    return res.status(400).json({ error: 'Napačna vsebina zahteve' })
  }
  if (body.playerIds.length === 0) {
    return res.status(400).json({ error: 'Ni izbranih igralcev' })
  }
  if (body.playerIds.length > NAJVEC_NA_ZAHTEVO) {
    return res.status(400).json({ error: `Naenkrat je mogoče odjaviti največ ${NAJVEC_NA_ZAHTEVO} igralcev` })
  }

  const report: ReleaseReport = { released: 0, names: [], skipped: [] }

  try {
    // Straža: preberemo samo tiste izbrane, ki so res v tem klubu.
    const { data: vKlubu, error: readErr } = await admin
      .from('users').select('id, full_name').eq('club_id', body.clubId).in('id', body.playerIds)
    if (readErr) throw new Error(`Branje članov: ${readErr.message}`)

    const najdeni = new Map<string, string | null>()
    for (const u of vKlubu ?? []) najdeni.set(u.id as string, (u.full_name as string | null) ?? null)

    for (const id of body.playerIds) {
      if (!najdeni.has(id)) report.skipped.push({ player: id, reason: 'Igralec ni član tega kluba (preskočeno)' })
    }
    if (najdeni.size === 0) return res.status(200).json(report)

    // club in club_id počistimo hkrati: prožilec sync_user_club napolni besedilo
    // le, kadar je club_id nastavljen, zato pri null ne stori ničesar in bi
    // staro ime kluba sicer ostalo zapisano.
    const ids = [...najdeni.keys()]
    const { error: upErr } = await admin
      .from('users').update({ club_id: null, club: null }).in('id', ids)
    if (upErr) throw new Error(`Odjava: ${upErr.message}`)

    report.released = ids.length
    report.names = ids.map(id => najdeni.get(id) || id)
    return res.status(200).json(report)
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e), report })
  }
}
