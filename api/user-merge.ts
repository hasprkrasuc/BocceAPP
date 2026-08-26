/**
 * ZDRUŽITEV DVEH ZAPISOV ISTE OSEBE
 *
 * Uvoz igralcev zna ustvariti drugi zapis za človeka, ki v bazi že je — kadar
 * v evidenci nima ne e-naslova ne EMŠO ne datuma rojstva, ga nima po čem ujeti.
 * Doslej smo takšne pare združevali ročno v SQL; ta pot to omogoči adminu.
 *
 * Zakaj prek strežnika: prestavitev sklicev teče prek funkcije
 * `zdruzi_uporabnika`, ki je odvzeta vsem razen service_role, bris prijavnega
 * računa pa živi v `auth.users`, kamor odjemalec ne more pisati niti kot admin.
 *
 * STRAŽA: klicatelj mora biti admin. Kadar ima KATERIKOLI od obeh zapisov
 * vlogo admin ali super_admin, mora biti klicatelj super_admin — sicer bi
 * lahko admin »združil« lastnika projekta vase in prevzel njegove pravice.
 *
 * VRSTNI RED je bistven in namenoma tak:
 *
 *   1. prestavi sklice (v bazi, ena transakcija — vse ali nič)
 *   2. prepiši podatke na obdržani zapis
 *   3. šele nato pobriši opuščeni račun
 *
 * Če pade tretji korak, ostane odvečen prazen zapis — nadležno, a nič ni
 * izgubljeno. Če bi brisali prej, bi ob padcu drugega koraka izgubili EMŠO,
 * datum rojstva in licenco brez sledi.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL as string
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string

/**
 * KOPIJA. Izvirnik je PRENOSLJIVA v src/engines/zdruzitevUporabnikov.ts.
 * api/ ne sme uvažati vrednosti iz src/ — Vercel zapakira le api/ in uvoz
 * pade z ERR_MODULE_NOT_FOUND. Ujemanje varuje test
 * src/engines/zdruzitevUporabnikov.sync.test.ts; ob spremembi popravi OBE kopiji.
 */
const PRENOSLJIVA = [
  ['full_name', 'ime'],
  ['emso', 'EMŠO'],
  ['date_of_birth', 'datum rojstva'],
  ['license_number', 'številka licence'],
  ['gender', 'spol'],
  ['club_id', 'klub'],
  ['photo_url', 'fotografija'],
] as const

/** KOPIJA ROLE_ORDER iz src/lib/roles.ts — isti razlog, isti varovalni test. */
const ROLE_ORDER = ['player', 'judge', 'admin', 'super_admin'] as const

/** KOPIJA GENERIC_EMAIL_DOMAINS iz src/lib/genericEmail.ts — isti razlog. */
const GENERIC_EMAIL_DOMAINS = ['balinar.app', 'bocceapp.si'] as const

type Zapis = Record<string, string | null>

const prazno = (v: unknown): boolean => v === null || v === undefined || v === ''

function jeGenericen(email: string | null): boolean {
  if (!email) return false
  const at = email.lastIndexOf('@')
  if (at < 0) return false
  return (GENERIC_EMAIL_DOMAINS as readonly string[]).includes(email.slice(at + 1).toLowerCase())
}

const rang = (v: string | null): number => ROLE_ORDER.indexOf((v ?? 'player') as typeof ROLE_ORDER[number])

interface Zahteva {
  /** Zapis, ki ostane. */
  keepId: string
  /** Zapis, ki se po prestavitvi pobriše. */
  dropId: string
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
  if (!body || typeof body.keepId !== 'string' || typeof body.dropId !== 'string' || !body.keepId || !body.dropId) {
    return res.status(400).json({ error: 'Napačna vsebina zahteve' })
  }
  if (body.keepId === body.dropId) {
    return res.status(400).json({ error: 'Obdržani in opuščeni zapis sta ista vrstica' })
  }

  const POLJA = 'id, full_name, email, emso, date_of_birth, license_number, gender, club_id, photo_url, role'

  try {
    const { data: zapisi, error: zErr } = await admin
      .from('users').select(POLJA).in('id', [body.keepId, body.dropId])
    if (zErr) throw new Error(`Branje zapisov: ${zErr.message}`)
    const obdrzi = (zapisi ?? []).find(z => (z as Zapis).id === body.keepId) as Zapis | undefined
    const opusti = (zapisi ?? []).find(z => (z as Zapis).id === body.dropId) as Zapis | undefined
    if (!obdrzi) return res.status(404).json({ error: 'Obdržanega zapisa ni v bazi' })
    if (!opusti) return res.status(404).json({ error: 'Opuščenega zapisa ni v bazi' })

    // Skrbniški zapis na katerikoli strani: samo super_admin. Brez tega bi lahko
    // admin združil super admina vase in podedoval njegove sklice.
    const skrbniski = [obdrzi.role, opusti.role].some(r => ['admin', 'super_admin'].includes(r ?? ''))
    if (skrbniski && mojaVloga !== 'super_admin') {
      return res.status(403).json({
        error: 'Zapis z administratorskimi pravicami lahko združi samo super administrator',
      })
    }

    // --- 1) Prestavitev sklicev (atomarno, v bazi) ---
    const { data: porocilo, error: rErr } = await admin.rpc('zdruzi_uporabnika', {
      obdrzi: body.keepId,
      opusti: body.dropId,
    })
    if (rErr) return res.status(409).json({ error: rErr.message })

    // --- 2) Podatki na obdržani zapis ---
    // EMŠO in licenco je funkcija na opuščenem zapisu že sprostila, zato ju je
    // zdaj mogoče zapisati sem brez trka z users_emso_uniq.
    const patch: Record<string, string | null> = {}
    const prevzeto: string[] = []
    for (const [polje, opis] of PRENOSLJIVA) {
      if (prazno(obdrzi[polje]) && !prazno(opusti[polje])) {
        patch[polje] = opusti[polje]
        prevzeto.push(opis)
      }
    }
    if (rang(opusti.role) > rang(obdrzi.role)) {
      patch.role = opusti.role
      prevzeto.push(`vloga ${opusti.role}`)
    }
    if (Object.keys(patch).length > 0) {
      const { error: pErr } = await admin.from('users').update(patch).eq('id', body.keepId)
      if (pErr) throw new Error(`Prepis podatkov: ${pErr.message}`)
    }

    // Pravi predal premaga tistega, ki ga je dodelila aplikacija — sicer bi
    // združitev človeka pustila brez poti do ponastavitve gesla.
    let novNaslov: string | null = null
    if (jeGenericen(obdrzi.email) && !jeGenericen(opusti.email) && opusti.email) {
      novNaslov = opusti.email.toLowerCase()
      // Prijavni naslov opuščenega je treba sprostiti, preden ga prevzame
      // obdržani — auth.users ima nad naslovom unikat.
      const zacasni = `zdruzen.${body.dropId}@balinar.app`
      const { error: sErr } = await admin.auth.admin.updateUserById(body.dropId, { email: zacasni })
      if (sErr) {
        novNaslov = null   // naslova ne prevzamemo; združitev sicer teče naprej
      } else {
        const { error: nErr } = await admin.auth.admin.updateUserById(body.keepId, {
          email: novNaslov, email_confirm: true,
        })
        if (nErr) novNaslov = null
        else await admin.from('users').update({ email: novNaslov }).eq('id', body.keepId)
      }
    }

    // --- 3) Bris opuščenega računa (CASCADE počisti public.users) ---
    const { error: dErr } = await admin.auth.admin.deleteUser(body.dropId)
    if (dErr) {
      return res.status(207).json({
        warning: 'Sklici so prestavljeni in podatki prepisani, opuščenega računa pa ni bilo mogoče pobrisati — ' +
                 `ostane prazen zapis. Napaka: ${dErr.message}`,
        prevzeto, porocilo, novNaslov,
      })
    }

    return res.status(200).json({
      keptId: body.keepId,
      name: patch.full_name ?? obdrzi.full_name,
      prevzeto,
      novNaslov,
      porocilo,
    })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}
