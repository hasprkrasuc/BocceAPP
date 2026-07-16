import type { ParsedPlayer, ExistingUser, ImportRow } from './types'
import { isValidEmso } from './emso'

// Deljeno tudi s strežniško funkcijo api/import-players.ts — ujemanje brez EMŠO
// se mora na obeh straneh normalizirati enako, sicer predogled in uvoz razideta.
export const normalizeName = (s: string | null): string =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/š/g, 's').replace(/ž/g, 'z').replace(/č/g, 'c').replace(/\s+/g, ' ').trim()

const norm = normalizeName

export function computeStatuses(
  players: ParsedPlayer[],
  existing: ExistingUser[],
  targetClubId: string,
): ImportRow[] {
  const byEmso = new Map<string, ExistingUser>()
  for (const u of existing) if (u.emso) byEmso.set(u.emso, u)

  return players.map((p): ImportRow => {
    if (p.emso && !isValidEmso(p.emso)) {
      return { player: p, status: 'error', existingUserId: null, currentClubId: null, error: 'Neveljaven EMŠO' }
    }

    let match: ExistingUser | undefined
    if (p.emso) {
      match = byEmso.get(p.emso)
    } else {
      // Brez EMŠO se lahko opremo le na ime + datum rojstva. Če datuma ni, ujemanje ni mogoče:
      // brez te straže bi se null === null izšlo in bi se ujeli zgolj po imenu — strežnik takega
      // igralca (upravičeno) preskoči, predogled pa bi kazal ujemanje, do katerega nikoli ne pride.
      if (!p.birthDate) {
        return { player: p, status: 'error', existingUserId: null, currentClubId: null, error: 'Brez EMŠO in datuma rojstva' }
      }
      const target = norm(p.fullName)
      const hits = existing.filter(u => u.date_of_birth !== null && u.date_of_birth === p.birthDate && norm(u.full_name) === target)
      // Strežnik dvoumnosti ne ugiba, zato je tudi predogled ne sme — sicer bi pokazal
      // prvega od več kandidatov, uvoz pa bi vrstico zavrnil.
      if (hits.length > 1) {
        return { player: p, status: 'error', existingUserId: null, currentClubId: null, error: 'Več kandidatov z istim imenom in datumom — potreben EMŠO' }
      }
      match = hits[0]
    }

    if (!match) return { player: p, status: 'new', existingUserId: null, currentClubId: null, error: null }
    if (match.club_id && match.club_id !== targetClubId) {
      return { player: p, status: 'transfer', existingUserId: match.id, currentClubId: match.club_id, error: null }
    }
    return { player: p, status: 'update', existingUserId: match.id, currentClubId: match.club_id, error: null }
  })
}
