import type { ParsedPlayer, ExistingUser, ImportRow } from './types'
import { isValidEmso } from './emso'

const norm = (s: string | null): string =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/š/g, 's').replace(/ž/g, 'z').replace(/č/g, 'c').replace(/\s+/g, ' ').trim()

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

    let match: ExistingUser | undefined = p.emso ? byEmso.get(p.emso) : undefined
    if (!match && !p.emso) {
      match = existing.find(u => norm(u.full_name) === norm(p.fullName) && u.date_of_birth === p.birthDate)
    }

    if (!match) return { player: p, status: 'new', existingUserId: null, currentClubId: null, error: null }
    if (match.club_id && match.club_id !== targetClubId) {
      return { player: p, status: 'transfer', existingUserId: match.id, currentClubId: match.club_id, error: null }
    }
    return { player: p, status: 'update', existingUserId: match.id, currentClubId: match.club_id, error: null }
  })
}
