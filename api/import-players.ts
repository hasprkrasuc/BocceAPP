import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import type { ImportRequest, ImportReport } from '../src/lib/playerImport/types'

const URL = process.env.SUPABASE_URL as string
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string

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
  if (!me || !['admin', 'super_admin'].includes(me.role)) return res.status(403).json({ error: 'Ni administrator' })

  const body = req.body as ImportRequest
  if (!body?.club?.name || !body?.target?.seasonId || !Array.isArray(body.players)) {
    return res.status(400).json({ error: 'Napačna vsebina zahteve' })
  }

  const report: ImportReport = { clubCreated: false, teamCreated: false, created: 0, updated: 0, transferred: 0, addedToTeam: 0, skipped: [] }

  try {
    // --- Klub (najdi/ustvari) ---
    let clubId: string
    const { data: existingClub } = await admin.from('clubs').select('id').ilike('name', body.club.name.trim()).maybeSingle()
    if (existingClub) {
      clubId = existingClub.id
    } else {
      const notes = [body.club.regId ? `Matična: ${body.club.regId}` : '', body.club.taxId ? `Davčna: ${body.club.taxId}` : ''].filter(Boolean).join(' · ')
      const { data: newClub, error } = await admin.from('clubs').insert({
        name: body.club.name.trim(), contact_name: body.club.contactName, contact_email: body.club.email,
        contact_phone: body.club.phone, notes: notes || null,
      }).select('id').single()
      if (error) throw new Error(`Klub: ${error.message}`)
      clubId = newClub.id
      report.clubCreated = true
    }

    // --- Ligaška ekipa (najdi/ustvari) ---
    let teamId: string
    if (body.target.teamId) {
      teamId = body.target.teamId
    } else {
      const clubName = (body.target.newTeamClubName || body.club.name).trim()
      const { data: newTeam, error } = await admin.from('league_teams').insert({
        season_id: body.target.seasonId, club_name: clubName,
      }).select('id').single()
      if (error) throw new Error(`Ekipa: ${error.message}`)
      teamId = newTeam.id
      report.teamCreated = true
    }

    // --- Igralci ---
    for (const p of body.players) {
      try {
        let userId: string | null = null
        let prevClubId: string | null = null
        if (p.emso) {
          const { data: found } = await admin.from('users').select('id, club_id').eq('emso', p.emso).maybeSingle()
          if (found) { userId = found.id; prevClubId = found.club_id }
        }

        if (!userId) {
          const localPart = p.fullName.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '') || 'igralec'
          const email = `${localPart}.${randomUUID().slice(0, 8)}@balinar.app`
          const { data: created, error: cErr } = await admin.auth.admin.createUser({
            email, password: randomUUID(), email_confirm: true,
            user_metadata: { full_name: p.fullName },
          })
          if (cErr || !created.user) throw new Error(cErr?.message || 'Napaka pri ustvarjanju računa')
          userId = created.user.id
          report.created++
        } else {
          if (prevClubId && prevClubId !== clubId) report.transferred++
          else report.updated++
        }

        const patch: Record<string, unknown> = { full_name: p.fullName, club_id: clubId, club: body.club.name.trim() }
        const optional: [string, unknown][] = [
          ['gender', p.gender], ['date_of_birth', p.birthDate], ['emso', p.emso],
          ['birth_city', p.birthCity], ['birth_country', p.birthCountry], ['citizenship', p.citizenship],
          ['address_street', p.addressStreet], ['address_house', p.addressHouse],
          ['address_postal', p.addressPostal], ['address_city', p.addressCity],
        ]
        for (const [k, v] of optional) if (v !== null && v !== undefined && v !== '') patch[k] = v
        const { error: upErr } = await admin.from('users').update(patch).eq('id', userId)
        if (upErr) throw new Error(`Profil: ${upErr.message}`)

        const { data: onTeam } = await admin.from('league_team_players')
          .select('id').eq('league_team_id', teamId).eq('player_id', userId).maybeSingle()
        if (!onTeam) {
          const { error: tErr } = await admin.from('league_team_players').insert({ league_team_id: teamId, player_id: userId })
          if (tErr) throw new Error(`Roster: ${tErr.message}`)
          report.addedToTeam++
        }
      } catch (e) {
        report.skipped.push({ player: p.fullName, reason: e instanceof Error ? e.message : String(e) })
      }
    }

    return res.status(200).json(report)
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e), report })
  }
}
