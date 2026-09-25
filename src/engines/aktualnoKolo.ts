/**
 * KATERO KOLO JE AKTUALNO — tisto, ki je v teku, oziroma prvo naslednje.
 *
 * Razpored sezone je dolg seznam: 1. liga ima 22 kol, ob končnici še več. Ko
 * nekdo odpre zavihek Razpored, ga zanima kolo, ki se igra zdaj ali je na
 * vrsti, ne prvo kolo septembra.
 *
 * Pravilo: aktualno je kolo, v katerem je PRVA TEKMA, ki je še ni bilo — prva
 * s terminom danes ali kasneje. Ko takih tekem ni več (sezona je končana),
 * obstanemo pri kolu z zadnjo odigrano tekmo.
 *
 * Zakaj prav prva prihodnja tekma in ne razpon kola. Razpon zavede, ker kola
 * v praksi niso strnjena:
 *
 *   - 1. liga 2026/27, 1. kolo: pet tekem 5. 9., šesta prestavljena na 27. 9.
 *     Razpon kola je torej 5.–27. september. Če bi kolo šteli za »v teku«,
 *     dokler ni pretekel ves razpon, bi 25. septembra razpored odprli pri
 *     1. kolu — čeprav je 2. kolo že v celoti odigrano in se 3. kolo igra
 *     naslednji dan.
 *   - Pokal BZS ima kolo raztegnjeno prek osmih različnih datumov.
 *
 * Prva prihodnja tekma je pri obeh ravno tisto, kar človek išče: najbližje,
 * kar se bo igralo.
 *
 * Datumi se berejo DOBESEDNO iz niza (prvih 10 znakov), enako kot v
 * `lib/matchDate.ts`. Pretvorba prek `Date` bi termine premaknila za uro ali
 * dve in kolo ob polnoči pripisala napačnemu dnevu.
 */

/** Tekma, kolikor je je potrebno za izbor aktualnega kola. */
export interface TerminKola {
  round_number: number
  scheduled_date?: string | null
}

/** Zakaj je kolo izbrano — za oznako v vmesniku. */
export type StanjeKola = 'v_teku' | 'naslednje' | 'zadnje_odigrano'

export interface AktualnoKolo {
  kolo: number
  stanje: StanjeKola
}

/** Datumski del termina (`YYYY-MM-DD`) ali prazno, če termina ni. */
function datumskiDel(s: string | null | undefined): string {
  if (!s) return ''
  const v = String(s).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''
}

/** Tekma s prebranim datumom; brez termina je v odločanju ni. */
interface Termin { kolo: number; datum: string }

function termini(tekme: TerminKola[]): Termin[] {
  const out: Termin[] = []
  for (const t of tekme) {
    const datum = datumskiDel(t.scheduled_date)
    if (datum) out.push({ kolo: t.round_number, datum })
  }
  return out
}

/**
 * Aktualno kolo glede na dan `danes` (`YYYY-MM-DD`), ali `null`, kadar se ni
 * po čem odločiti — nobena tekma nima termina.
 *
 * Kola brez terminov v odločanje ne štejejo: če bi kolo brez datuma veljalo za
 * naslednje, bi razpored obstal na njem do konca sezone. V razporedu ostanejo,
 * le nanje ne skočimo.
 */
export function aktualnoKolo(tekme: TerminKola[], danes: string): AktualnoKolo | null {
  const vsi = termini(tekme)
  if (vsi.length === 0) return null

  // Prva tekma s terminom danes ali kasneje. Ob istem datumu v dveh kolih
  // (prestavitev prek meje kola) velja nižje kolo — tisto, ki se je začelo prej.
  const prihodnje = vsi.filter(t => t.datum >= danes)
  const izbrana = prihodnje.length
    ? prihodnje.reduce((a, b) => (b.datum < a.datum || (b.datum === a.datum && b.kolo < a.kolo) ? b : a))
    // Sezona je končana — obstanemo pri kolu z zadnjo odigrano tekmo.
    : vsi.reduce((a, b) => (b.datum > a.datum || (b.datum === a.datum && b.kolo > a.kolo) ? b : a))

  return { kolo: izbrana.kolo, stanje: stanjeKola(vsi, izbrana.kolo, danes) }
}

/**
 * Oznaka stanja izbranega kola.
 *
 * `v_teku` pomeni, da se kolo igra ravno zdaj: bodisi ima tekmo danes, bodisi
 * je danes med njegovo prvo in zadnjo tekmo (kolo, razpotegnjeno na soboto in
 * ponedeljek, je v nedeljo še vedno v teku).
 */
function stanjeKola(vsi: Termin[], kolo: number, danes: string): StanjeKola {
  const datumi = vsi.filter(t => t.kolo === kolo).map(t => t.datum)
  const od = datumi.reduce((a, b) => (b < a ? b : a))
  const doDatum = datumi.reduce((a, b) => (b > a ? b : a))
  if (datumi.includes(danes)) return 'v_teku'
  if (od < danes && danes < doDatum) return 'v_teku'
  return doDatum < danes ? 'zadnje_odigrano' : 'naslednje'
}

/** Oznaka stanja za vmesnik. */
export function oznakaStanjaKola(stanje: StanjeKola): string {
  switch (stanje) {
    case 'v_teku': return 'v teku'
    case 'naslednje': return 'naslednje'
    case 'zadnje_odigrano': return 'zadnje odigrano'
  }
}

/** Današnji dan kot `YYYY-MM-DD` po LOKALNEM času, ne po UTC. */
export function danesLokalno(zdaj: Date = new Date()): string {
  const m = String(zdaj.getMonth() + 1).padStart(2, '0')
  const d = String(zdaj.getDate()).padStart(2, '0')
  return `${zdaj.getFullYear()}-${m}-${d}`
}
