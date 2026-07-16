import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import type { ImportRequest, ImportReport } from '../src/lib/playerImport/types'
import { normalizeName } from '../src/lib/playerImport/matchPlayers'
import { normalizeEmso } from '../src/lib/playerImport/emso'

const URL = process.env.SUPABASE_URL as string
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string

const createAdminClient = () =>
  createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
type AdminClient = ReturnType<typeof createAdminClient>

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!URL || !SERVICE_KEY) return res.status(500).json({ error: 'Manjkata SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' })

  const admin = createAdminClient()

  // --- Avtorizacija: klicatelj mora biti admin ---
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Manjka avtorizacija' })
  const { data: userData, error: uErr } = await admin.auth.getUser(token)
  if (uErr || !userData.user) return res.status(401).json({ error: 'Neveljavna seja' })
  const { data: me } = await admin.from('users').select('role').eq('id', userData.user.id).single()
  if (!me || !['admin', 'super_admin'].includes(me.role as string)) return res.status(403).json({ error: 'Ni administrator' })

  const body = req.body as ImportRequest
  if (!body?.club?.name || !body?.target?.seasonId || !Array.isArray(body.players)) {
    return res.status(400).json({ error: 'Napačna vsebina zahteve' })
  }

  const report: ImportReport = { clubCreated: false, teamCreated: false, created: 0, updated: 0, transferred: 0, addedToTeam: 0, skipped: [] }

  try {
    const clubName = body.club.name.trim()

    // --- Klub: admin ga IZRECNO izbere v vmesniku — ime iz Excela je le predlog,
    // ni zaupanja vredno za samodejno ujemanje (glej ADR/komentar ob ImportTarget).
    let clubId: string
    if (body.target.clubId) {
      const { data: club, error: clubErr } = await admin
        .from('clubs').select('id').eq('id', body.target.clubId).maybeSingle()
      if (clubErr) throw new Error(`Napaka pri preverjanju izbranega kluba: ${clubErr.message}`)
      if (!club) throw new Error('Izbrani klub ne obstaja.')
      clubId = club.id as string
      report.clubCreated = false
    } else {
      // Nov klub: admin je izrecno izbral "ustvari nov klub". Kljub temu preverimo
      // ujemanje po imenu kot varovalo pred nehotenim podvojevanjem — če se najde,
      // naj admin raje izbere obstoječega v spustnem seznamu.
      const { data: existingClub, error: clubFindErr } = await admin
        .from('clubs').select('id').ilike('name', clubName).maybeSingle()
      if (clubFindErr) {
        throw new Error(`Napaka pri preverjanju imena kluba "${clubName}" (morda obstaja več klubov z istim imenom): ${clubFindErr.message}`)
      }
      if (existingClub) {
        throw new Error(`Klub »${clubName}« že obstaja v bazi — izberi ga v spustnem seznamu namesto ustvarjanja novega.`)
      }
      const notes = [body.club.regId ? `Matična: ${body.club.regId}` : '', body.club.taxId ? `Davčna: ${body.club.taxId}` : ''].filter(Boolean).join(' · ')
      const { data: newClub, error } = await admin.from('clubs').insert({
        name: clubName, contact_name: body.club.contactName, contact_email: body.club.email,
        contact_phone: body.club.phone, notes: notes || null,
      }).select('id').single()
      if (error) throw new Error(`Klub: ${error.message}`)
      clubId = newClub.id as string
      report.clubCreated = true
    }

    // --- Ligaška ekipa (najdi/ustvari) ---
    // Brez iskanja bi ponovni uvoz ustvaril drugo ekipo in vanjo znova vpisal vse igralce.
    let teamId: string
    if (body.target.teamId) {
      teamId = body.target.teamId
    } else {
      const teamClubName = (body.target.newTeamClubName || body.club.name).trim()
      // ilike (ne eq): ime ekipe admin vtipka na roko, zato bi "BK Sava" / "BK sava"
      // ob eq ustvarila dve ekipi — enaka past kot pri klubu.
      const { data: existingTeam, error: teamFindErr } = await admin
        .from('league_teams').select('id')
        .eq('season_id', body.target.seasonId).ilike('club_name', teamClubName).maybeSingle()
      if (teamFindErr) {
        throw new Error(`Napaka pri iskanju ekipe "${teamClubName}" v tej sezoni (morda obstaja več ekip z istim imenom): ${teamFindErr.message}`)
      }
      if (existingTeam) {
        teamId = existingTeam.id as string
      } else {
        const { data: newTeam, error } = await admin.from('league_teams').insert({
          season_id: body.target.seasonId, club_name: teamClubName,
        }).select('id').single()
        if (error) throw new Error(`Ekipa: ${error.message}`)
        teamId = newTeam.id as string
        report.teamCreated = true
      }
    }

    // --- Igralci ---
    for (const p of body.players) {
      let userId: string | null = null
      let createdHere = false
      try {
        let prevClubId: string | null = null

        // Strežnik je meja zaupanja, a preverja le OBLIKO (13 števk) — kontrolne števke
        // ne preverjamo več: neveljavna kontrolna števka je pri realnih podatkih pogosto
        // le tipkarska napaka kluba (ponovi se vsako sezono), zato je sprejeta in le opozorilo
        // v predogledu, ne blokada. Pravi nesmisel (napačna dolžina/nedigitalni znaki) še vedno zavrnemo.
        if (p.emso && !/^\d{13}$/.test(normalizeEmso(p.emso))) throw new Error('Neveljaven EMŠO (mora biti natanko 13 števk)')

        if (p.emso) {
          const { data: found, error: findErr } = await admin
            .from('users').select('id, club_id').eq('emso', p.emso).maybeSingle()
          if (findErr) throw new Error(`Iskanje po EMŠO: ${findErr.message}`)
          if (found) { userId = found.id as string; prevClubId = (found.club_id as string | null) ?? null }
        } else if (p.birthDate) {
          // Brez EMŠO ujemamo po normaliziranem imenu + datumu rojstva (enako kot predogled),
          // sicer bi vsak uvoz ustvaril nov račun za istega igralca.
          const match = await matchByNameAndBirth(admin, p.fullName, p.birthDate)
          if (match) { userId = match.id; prevClubId = match.club_id }
        } else {
          throw new Error('Brez EMŠO in datuma rojstva — ne morem varno ujeti (preskočeno, da ne podvojim)')
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
          createdHere = true
        }

        const patch: Record<string, unknown> = { full_name: p.fullName, club_id: clubId, club: clubName }
        const optional: [string, unknown][] = [
          ['gender', p.gender], ['date_of_birth', p.birthDate], ['emso', p.emso],
          ['birth_city', p.birthCity], ['birth_country', p.birthCountry], ['citizenship', p.citizenship],
          ['address_street', p.addressStreet], ['address_house', p.addressHouse],
          ['address_postal', p.addressPostal], ['address_city', p.addressCity],
        ]
        for (const [k, v] of optional) if (v !== null && v !== undefined && v !== '') patch[k] = v
        const { error: upErr } = await admin.from('users').update(patch).eq('id', userId)
        if (upErr) throw new Error(`Profil: ${upErr.message}`)

        const { data: onTeam, error: rosterFindErr } = await admin.from('league_team_players')
          .select('id').eq('league_team_id', teamId).eq('player_id', userId).maybeSingle()
        if (rosterFindErr) throw new Error(`Roster: ${rosterFindErr.message}`)
        let addedToTeam = false
        if (!onTeam) {
          const { error: tErr } = await admin.from('league_team_players').insert({ league_team_id: teamId, player_id: userId })
          if (tErr) throw new Error(`Roster: ${tErr.message}`)
          addedToTeam = true
        }

        // Števci šele po zadnjem uspešnem pisanju — sicer bi igralec, ki kasneje pade,
        // štel hkrati med created in skipped.
        if (createdHere) report.created++
        else if (prevClubId && prevClubId !== clubId) report.transferred++
        else report.updated++
        if (addedToTeam) report.addedToTeam++
      } catch (e) {
        let reason = e instanceof Error ? e.message : String(e)
        // Račun, ki smo ga ustvarili v tej iteraciji, moramo pospraviti: profil ostane brez
        // EMŠO, zato ga naslednji uvoz ne bi našel in bi ustvaril še enega — vsakič znova.
        if (createdHere && userId) {
          try {
            // deleteUser napake vrne v rezultatu (ne vrže), zato preverimo oboje —
            // sicer bi neuspelo čiščenje poročali kot uspešno razveljavitev.
            const { error: delErr } = await admin.auth.admin.deleteUser(userId)
            if (delErr) throw new Error(delErr.message)
            reason += ' (ustvarjeni račun je bil razveljavljen)'
          } catch (delErr) {
            reason += ` (POZOR: ustvarjenega računa ${userId} ni bilo mogoče razveljaviti: ${delErr instanceof Error ? delErr.message : String(delErr)})`
          }
        }
        report.skipped.push({ player: p.fullName, reason })
      }
    }

    return res.status(200).json(report)
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e), report })
  }
}

/** Ujemanje brez EMŠO: kandidate zožimo po datumu rojstva, ime primerjamo normalizirano v JS. */
async function matchByNameAndBirth(
  admin: AdminClient,
  fullName: string,
  birthDate: string,
): Promise<{ id: string; club_id: string | null } | null> {
  const { data, error } = await admin
    .from('users').select('id, full_name, club_id').eq('date_of_birth', birthDate)
  if (error) throw new Error(`Iskanje po imenu in datumu rojstva: ${error.message}`)
  const target = normalizeName(fullName)
  const hits = (data ?? []).filter(u => normalizeName(u.full_name as string | null) === target)
  if (hits.length > 1) {
    throw new Error(`Najdenih več igralcev "${fullName}" z istim datumom rojstva — brez EMŠO ne morem razločiti`)
  }
  if (hits.length === 0) return null
  return { id: hits[0].id as string, club_id: (hits[0].club_id as string | null) ?? null }
}
