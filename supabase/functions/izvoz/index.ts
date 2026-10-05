/**
 * IZVOZNI API — podatki igralcev in rezultatski dosežki za zunanje sisteme
 * (evidenca BZS na evidence.balinanje.si, posredovanje na portal OKS za
 * rezultate in kategorizacije).
 *
 * Dostop varuje API ključ v glavi `X-Api-Kljuc`; v bazi je shranjen samo
 * sha256 ključa (tabela `izvoz_api_kljuci`, migracija 20261005_01). Funkcija
 * je uvedena z verify_jwt=false — avtentikacija je v celoti ta ključ, zato
 * klicatelj ne potrebuje nobene Supabase glave.
 *
 * Končni točki (specifikacija: docs/IZVOZ_API.md):
 *   GET /izvoz/v1/igralci   — registrirani igralci (vključno z EMŠO)
 *   GET /izvoz/v1/dosezki   — uvrstitve z državnih prvenstev (?leto=2026)
 *
 * Osebni podatki: EMŠO in datum rojstva gresta ven SAMO prek tega varovanega
 * API-ja; prejemnik je zveza oziroma njen pogodbeni obdelovalec.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const KOS = 1000

const KATEGORIJE: Record<string, string> = {
  men: 'člani', women: 'članice', u18: 'U18', u18_women: 'U18 mladinke',
  u15: 'U15', u14: 'U14', u12: 'U12', mixed: 'mešano',
}

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function veljavenKljuc(req: Request): Promise<boolean> {
  const kljuc = req.headers.get('x-api-kljuc')?.trim()
  if (!kljuc) return false
  const hash = await sha256hex(kljuc)
  const { data, error } = await supabase
    .from('izvoz_api_kljuci').select('id')
    .eq('kljuc_hash', hash).eq('aktiven', true).maybeSingle()
  if (error) throw error
  return data !== null
}

/** Prebere VSE vrstice poizvedbe po kosih — PostgREST sicer tiho vrne prvih 1000. */
async function vse<T>(poizvedba: (od: number, doVklj: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = []
  for (let od = 0; ; od += KOS) {
    const { data, error } = await poizvedba(od, od + KOS - 1)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < KOS) return out
  }
}

function json(telo: unknown, status = 200): Response {
  return new Response(JSON.stringify(telo, null, 1), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

/** Registrirani igralci: vloga 'player' + člani ligaških postav z drugo vlogo. */
async function igralci(): Promise<Response> {
  type Vrstica = {
    id: string; full_name: string | null; birth_year: number | null
    date_of_birth: string | null; gender: string | null; emso: string | null
    citizenship: string | null; club: string | null; club_id: string | null
    license_number: string | null; obz_reg_number: string | null; role: string
  }
  const STOLPCI = 'id, full_name, birth_year, date_of_birth, gender, emso, citizenship, club, club_id, license_number, obz_reg_number, role'

  const [uporabniki, postave] = await Promise.all([
    vse<Vrstica>((od, d) => supabase.from('users').select(STOLPCI).order('id').range(od, d)),
    vse<{ player_id: string | null }>((od, d) =>
      supabase.from('league_team_players').select('player_id').order('player_id').range(od, d)),
  ])
  const vPostavah = new Set(postave.map(p => p.player_id).filter(Boolean))
  const izbrani = uporabniki.filter(u => u.role === 'player' || vPostavah.has(u.id))

  return json({
    verzija: 'v1',
    ustvarjeno: new Date().toISOString(),
    stevilo: izbrani.length,
    igralci: izbrani.map(u => ({
      id: u.id,
      ime_priimek: u.full_name,
      datum_rojstva: u.date_of_birth || null,
      letnik: u.birth_year,
      spol: u.gender,              // 'M' / 'Ž'
      emso: u.emso,
      drzavljanstvo: u.citizenship,
      klub: u.club_id ? { id: u.club_id, naziv: u.club } : null,
      sportna_stevilka: u.license_number,
      obz_stevilka: u.obz_reg_number,
    })),
  })
}

/** Uvrstitve z zaključenih državnih prvenstev (končni vrstni red iz grafikona). */
async function dosezki(url: URL): Promise<Response> {
  const leto = url.searchParams.get('leto')

  type Prvenstvo = {
    id: string; name: string; date: string; category: string | null
    discipline_type: string | null
  }
  let q = supabase.from('tournaments')
    .select('id, name, date, category, discipline_type')
    .eq('kind', 'championship').eq('status', 'completed')
  if (leto) q = q.gte('date', `${leto}-01-01`).lte('date', `${leto}-12-31`)
  const { data: turnirji, error: tErr } = await q.order('date', { ascending: false })
  if (tErr) throw tErr

  type Prijava = {
    tournament_id: string; final_rank: number | null
    player1_id: string | null; player2_id: string | null
    player1_name: string | null; player2_name: string | null
    player1: { id: string; full_name: string | null; emso: string | null } | null
    player2: { id: string; full_name: string | null; emso: string | null } | null
  }
  const ids = ((turnirji ?? []) as Prvenstvo[]).map(t => t.id)
  const prijave = ids.length === 0 ? [] : await vse<Prijava>((od, d) =>
    supabase.from('tournament_registrations')
      .select('tournament_id, final_rank, player1_id, player2_id, player1_name, player2_name,'
        + ' player1:users!tournament_registrations_player1_id_fkey(id, full_name, emso),'
        + ' player2:users!tournament_registrations_player2_id_fkey(id, full_name, emso)')
      .in('tournament_id', ids).order('id').range(od, d))

  const poTurnirju = new Map<string, Prijava[]>()
  for (const p of prijave) {
    poTurnirju.set(p.tournament_id, [...(poTurnirju.get(p.tournament_id) ?? []), p])
  }

  const igralec = (
    u: { id: string; full_name: string | null; emso: string | null } | null,
    ime: string | null,
  ) => u ? { id: u.id, ime_priimek: u.full_name, emso: u.emso }
       : ime ? { id: null, ime_priimek: ime, emso: null } : null

  const out = []
  for (const t of (turnirji ?? []) as Prvenstvo[]) {
    const vse_prijave = poTurnirju.get(t.id) ?? []
    const uvrsceni = vse_prijave
      .filter(p => p.final_rank !== null)
      .sort((a, b) => a.final_rank! - b.final_rank!)
    for (const p of uvrsceni) {
      out.push({
        tekmovanje: {
          id: t.id,
          naziv: t.name.trim(),
          vrsta: 'drzavno_prvenstvo',
          datum: t.date,
          kategorija: KATEGORIJE[t.category ?? ''] ?? t.category,
          disciplina: t.discipline_type,
          st_udelezencev: vse_prijave.length,
        },
        mesto: p.final_rank,
        igralca: [igralec(p.player1, p.player1_name), igralec(p.player2, p.player2_name)]
          .filter(Boolean),
      })
    }
  }
  return json({ verzija: 'v1', ustvarjeno: new Date().toISOString(), stevilo: out.length, dosezki: out })
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'GET') return json({ napaka: 'Dovoljen je samo GET.' }, 405)
    if (!(await veljavenKljuc(req))) {
      return json({ napaka: 'Neveljaven ali manjkajoč API ključ (glava X-Api-Kljuc).' }, 401)
    }
    const url = new URL(req.url)
    // Pot za imenom funkcije: /izvoz/v1/igralci → v1/igralci
    const pot = url.pathname.replace(/^.*?\/izvoz\/?/, '').replace(/\/+$/, '')
    if (pot === 'v1/igralci') return await igralci()
    if (pot === 'v1/dosezki') return await dosezki(url)
    if (pot === 'v1' || pot === '') {
      return json({ verzija: 'v1', koncne_tocke: ['v1/igralci', 'v1/dosezki?leto=2026'] })
    }
    return json({ napaka: `Neznana pot: ${pot}` }, 404)
  } catch (e) {
    console.error(e)
    return json({ napaka: 'Napaka strežnika.' }, 500)
  }
})
