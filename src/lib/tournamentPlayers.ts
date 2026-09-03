import { supabase } from '../supabase'
import { fetchAllRows } from './fetchAllRows'
import { USER_PUBLIC_COLS } from './userColumns'
import type { UserProfile } from '../types'

/**
 * Vgnezdena polja prijave na turnir. `users` je NUJNO naštet po stolpcih —
 * branje vseh stolpcev vrne 403 "permission denied for table users", ker je
 * SELECT za vlogo authenticated omejen na USER_PUBLIC_COLS
 * (migracija 20260729_02_users_pii_authenticated).
 *
 * Niz je bil nekoč zapisan v vsaki poizvedbi posebej in kopije so ušle
 * narazen (29. 7. 2026 se prijave zato niso prikazale). Zdaj je na enem
 * mestu; uporabljata ga administracija turnirja in žreb v živo.
 */
export const PRIJAVA_SELECT =
  `*, player1:users!tournament_registrations_player1_id_fkey(${USER_PUBLIC_COLS})`
  + `, player2:users!tournament_registrations_player2_id_fkey(${USER_PUBLIC_COLS})`
  + `, guest1:guest_players!tournament_registrations_player1_guest_id_fkey(*)`
  + `, guest2:guest_players!tournament_registrations_player2_guest_id_fkey(*)`

/**
 * Igralci, izbirljivi na turnirjih.
 *
 * = vsi z vlogo `player` PLUS člani ligaških postav, ki imajo drugo primarno
 * vlogo (sodniki/admini, ki tudi igrajo). Slednji bi sicer manjkali, ker
 * seznam filtrira `role = 'player'` — npr. igralec-sodnik ali igralec, ki je
 * hkrati administrator kluba.
 *
 * OBE poizvedbi morata brati po straneh. PostgREST vrne največ 1000 vrstic in
 * ostalih ne omeni — dobiš krnjen seznam brez napake. Branje postav je bilo
 * nekoč napisano kot en sam `select` brez stranjenja; 29. 8. 2026 je imela
 * tabela 4054 vrstic, prebralo se jih je 1000, in sodnik Branko Sedej, ki
 * igra v štirih ekipah, se na prvenstvu ni dal izbrati. Ker ima tabela indeks
 * na `player_id`, vrstni red ni bil niti vrstni red vpisa — odrezalo je po
 * id-ju, torej naključno glede na to, kdo manjka.
 *
 * `fetchAllRows` napako vrže naprej; klicatelj naj jo pokaže. Krnjen seznam je
 * slabši od napake, ker ga nihče ne opazi.
 */
export async function loadTournamentPlayers(
  // birth_year namesto date_of_birth: poln datum je občutljiv, za starostne
  // kategorije pa zadošča letnik.
  columns = 'id, full_name, club, club_id, birth_year',
): Promise<UserProfile[]> {
  // 1) Vsi z vlogo 'player'.
  const all = await fetchAllRows<UserProfile>((od, doVkljucno) =>
    supabase.from('users').select(columns).eq('role', 'player')
      .order('full_name').range(od, doVkljucno) as never)

  // 2) Člani ligaških postav, ki jih 1) ne zajame (druga primarna vloga).
  //    Urejenost po `player_id` ni okras: brez stabilnega vrstnega reda lahko
  //    stranjenje vrstice podvoji ali preskoči.
  const postave = await fetchAllRows<{ player_id: string }>((od, doVkljucno) =>
    supabase.from('league_team_players').select('player_id')
      .order('player_id').range(od, doVkljucno) as never)

  const ze = new Set(all.map(p => p.id))
  const manjkajo = [...new Set(postave.map(r => r.player_id))].filter(id => id && !ze.has(id))

  // `in` z več sto vrednostmi razbijemo na kose, da URL ne preraste omejitve.
  for (let i = 0; i < manjkajo.length; i += 300) {
    const { data, error } = await supabase
      .from('users')
      .select(columns)
      .in('id', manjkajo.slice(i, i + 300))
    if (error) throw error
    all.push(...((data ?? []) as unknown as UserProfile[]))
  }

  all.sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'sl'))
  return all
}
