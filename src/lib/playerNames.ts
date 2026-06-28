import { supabase } from '../supabase'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Razdeli mešan seznam (UUID | prosto ime) na UUID-je in imena (brez dvojnikov). */
export function splitPlayerIds(ids: string[]): { uuids: string[]; names: string[] } {
  const uuids: string[] = []
  const names: string[] = []
  for (const id of [...new Set(ids)]) {
    if (!id) continue
    if (UUID_RE.test(id)) uuids.push(id)
    else names.push(id)
  }
  return { uuids, names }
}

export interface ResolvedPlayer {
  full_name: string
  club: string | null
}

/**
 * Razreši seznam (UUID | ime) v zemljevid prikaznih imen + klubov.
 * UUID-je poišče v users (brez sodnikov); prosta imena pusti dobesedno.
 */
export async function resolvePlayerNames(ids: string[]): Promise<Map<string, ResolvedPlayer>> {
  const { uuids, names } = splitPlayerIds(ids)
  const map = new Map<string, ResolvedPlayer>()
  for (const n of names) map.set(n, { full_name: n, club: null })
  if (uuids.length) {
    const { data } = await supabase.from('users').select('id, full_name, club, role').in('id', uuids)
    for (const u of (data ?? []).filter((x: { role?: string }) => x.role !== 'judge')) {
      map.set(u.id, { full_name: u.full_name ?? `?? ${u.id.slice(0, 8)}`, club: u.club ?? null })
    }
  }
  return map
}
