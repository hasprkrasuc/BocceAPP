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

/**
 * Vrednost za `<input type="datetime-local">` iz shranjenega termina.
 * Reže dobesedno iz niza — enako kot matchDatePart/matchTimePart in kot
 * zapisnik tekme. Časovnega zamika NE upošteva namenoma: kar admin vtipka,
 * se tako shrani in tako prikaže. Če bi tu pretvarjali prek Date, bi se vsi
 * obstoječi termini premaknili za eno ali dve uri.
 */
export function toDateTimeLocal(s?: string | null): string {
  if (!s) return ''
  const v = String(s).slice(0, 16)
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v.replace(' ', 'T'))
    ? v.replace(' ', 'T')
    : ''
}

/**
 * Skupni termin kola: vrednost, če jo imajo vse tekme enako, sicer prazno.
 * Prazno pomeni "kolo nima enotnega termina" — ali ga nima nobena tekma ali
 * pa so razpršene po različnih dnevih.
 */
export function skupniTerminKola(termini: (string | null | undefined)[]): string {
  if (termini.length === 0) return ''
  const prvi = toDateTimeLocal(termini[0])
  if (!prvi) return ''
  return termini.every(t => toDateTimeLocal(t) === prvi) ? prvi : ''
}

/** Kratek povzetek terminov kola za admin ("5 tekem · 4. 9. 2026 ob 18:00"). */
export function povzetekTerminovKola(termini: (string | null | undefined)[]): string {
  const brez = termini.filter(t => !toDateTimeLocal(t)).length
  const skupni = skupniTerminKola(termini)
  if (skupni) return formatMatchDateTime(skupni)
  if (brez === termini.length) return 'brez termina'
  const razlicni = new Set(termini.map(t => matchDatePart(t)).filter(Boolean))
  const opis = razlicni.size === 1 ? [...razlicni][0] : `${razlicni.size} različnih datumov`
  return brez > 0 ? `${opis} · ${brez} brez termina` : opis
}
