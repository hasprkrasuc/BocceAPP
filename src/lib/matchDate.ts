/**
 * Formatiranje termina tekme iz ISO/timestamptz niza ali "YYYY-MM-DDTHH:mm"
 * BREZ časovnega zamika (beremo dobesedno iz niza, da se ujema z vnosom).
 */
export function matchDatePart(s?: string | null): string {
  if (!s) return ''
  const [y, m, d] = String(s).slice(0, 10).split('-')
  if (!y || !m || !d) return ''
  return `${Number(d)}. ${Number(m)}. ${y}`
}

export function matchTimePart(s?: string | null): string {
  if (!s) return ''
  const t = String(s).slice(11, 16)
  // '00:00' obravnavamo kot "brez ure" (nastavljen le datum)
  return /^\d{2}:\d{2}$/.test(t) && t !== '00:00' ? t : ''
}

export function formatMatchDateTime(s?: string | null): string {
  const d = matchDatePart(s)
  const t = matchTimePart(s)
  if (!d) return ''
  return t ? `${d} ob ${t}` : d
}
