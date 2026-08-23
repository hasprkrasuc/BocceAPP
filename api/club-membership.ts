/**
 * KLUBSKO ČLANSTVO — nastavitev in odvzem kluba
 *
 * Ena sama pot za oboje:
 *   - odjava članov ob uvozu   (toClubId: null, expectFromClubId: klub)
 *   - nastavitev kluba na profilu igralca (toClubId: klub)
 *
 * Zakaj prek strežnika in ne neposredno iz vmesnika: pisanje po `users` je z
 * RLS omejeno, poleg tega je klubsko članstvo edini podatek, ki ga aplikacija
 * nikjer ne vodi zgodovinsko — prejšnji klub se ob spremembi izgubi. Takšno
 * dejanje sodi na eno mesto, kjer ga je mogoče zavarovati in poročati o njem.
 *
 * STRAŽA: `expectFromClubId` pove, v katerem klubu naj bi igralci trenutno bili
 * (`null` = brez kluba). Strežnik ravna samo s tistimi, ki se ujemajo. To lovi
 * dvoje — klic mimo vmesnika in zastarel seznam na zaslonu, kjer je nekdo med
 * tem že prestopil.
 *
 * `club` (besedilo) in `club_id` se vedno pišeta skupaj. Prožilec
 * sync_user_club besedila ne povozi, kadar ni prazno, zato bi sicer ostalo
 * zapisano staro ime kluba.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import type { ClubMembershipRequest, ClubMembershipReport } from '../src/lib/playerImport/types'

const URL = process.env.SUPABASE_URL as string
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string

/** Zgornja meja na zahtevo — sprememba članstva cele baze naenkrat ni legitimen primer. */
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

  const body = req.body as ClubMembershipRequest
  if (!body || !Array.isArray(body.playerIds) || body.toClubId === undefined || body.expectFromClubId === undefined) {
    return res.status(400).json({ error: 'Napačna vsebina zahteve' })
  }
  if (body.playerIds.length === 0) return res.status(400).json({ error: 'Ni izbranih igralcev' })
  if (body.playerIds.length > NAJVEC_NA_ZAHTEVO) {
    return res.status(400).json({ error: `Naenkrat je mogoče spremeniti največ ${NAJVEC_NA_ZAHTEVO} igralcev` })
  }

  const report: ClubMembershipReport = { changed: 0, names: [], skipped: [] }

  try {
    // Ime kluba potrebujemo za besedilni stolpec; hkrati preverimo, da klub obstaja.
    let clubName: string | null = null
    if (body.toClubId !== null) {
      const { data: club, error: cErr } = await admin
        .from('clubs').select('name').eq('id', body.toClubId).maybeSingle()
      if (cErr) throw new Error(`Branje kluba: ${cErr.message}`)
      if (!club) return res.status(400).json({ error: 'Izbrani klub ne obstaja' })
      clubName = club.name as string
    }

    const { data: igralci, error: readErr } = await admin
      .from('users').select('id, full_name, club_id').in('id', body.playerIds)
    if (readErr) throw new Error(`Branje igralcev: ${readErr.message}`)

    const najdeni = new Map((igralci ?? []).map(u => [u.id as string, u]))
    const zaSpremembo: string[] = []

    for (const id of body.playerIds) {
      const u = najdeni.get(id)
      if (!u) { report.skipped.push({ player: id, reason: 'Igralca ni v bazi' }); continue }
      const trenutni = (u.club_id as string | null) ?? null
      if (trenutni !== body.expectFromClubId) {
        report.skipped.push({
          player: (u.full_name as string | null) ?? id,
          reason: 'Klub se je med tem spremenil — osveži stran in poskusi znova',
        })
        continue
      }
      zaSpremembo.push(id)
    }

    if (zaSpremembo.length === 0) return res.status(200).json(report)

    const { error: upErr } = await admin
      .from('users').update({ club_id: body.toClubId, club: clubName }).in('id', zaSpremembo)
    if (upErr) throw new Error(`Sprememba članstva: ${upErr.message}`)

    report.changed = zaSpremembo.length
    report.names = zaSpremembo.map(id => (najdeni.get(id)?.full_name as string | null) || id)
    return res.status(200).json(report)
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e), report })
  }
}
