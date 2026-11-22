/**
 * Prevod napak PostgreSQL v sporočila, ki adminu kaj povedo.
 *
 * Nastalo 22. 11. 2026 iz konkretne nevšečnosti: v ligi U14 2026/27 je bila
 * dodana Dvojka brez rezerve, admin je hotel staro izbrisati in jo nadomestiti
 * z Dvojko z rezervnim igralcem — novo je dodalo, stare pa ni pobrisalo in ni
 * povedalo zakaj. Zaslon je namreč odgovor baze zavrgel:
 *
 *     await supabase.from('league_season_disciplines').delete().eq('id', disc.id)
 *     loadDisciplines()
 *
 * Baza je brisanje zavrnila s `23503`, ker so bili na tisto disciplino vezani
 * štirje odigrani rezultati — tuji ključ nima `on delete`. Brez tega prevoda
 * bi admin videl samo surovo angleško besedilo o kršitvi omejitve, z
 * zavrženim odgovorom pa ni videl niti tega.
 *
 * Funkcije so čiste in brez V/I, zato so pokrite s testi v `napakeBaze.test.ts`.
 */

/** Kar od napake potrebujemo; ustreza `PostgrestError` in navadnemu `Error`. */
export type NapakaBaze = {
  code?: string | null
  message?: string | null
  details?: string | null
}

export type Akcija = 'brisanje' | 'dodajanje' | 'urejanje'

const IMENOVALNIK: Readonly<Record<Akcija, string>> = {
  brisanje: 'brisanje',
  dodajanje: 'dodajanje',
  urejanje: 'urejanje',
}

/**
 * Sporočilo za zaslon. `kaj` je samostalnik v rodilniku, ker se v vse stavke
 * usede brez sklanjanja — na primer `Discipline "DVOJKA"`.
 */
export function sporociloNapake(
  napaka: NapakaBaze,
  kaj: string,
  akcija: Akcija,
  /**
   * Neobvezen namig za `23503`, ki pove, KAJ je vezano in kako to odpraviti.
   * Kadar je podan, nadomesti splošno razlago — ta je sicer pisana za
   * rezultate tekem in bi drugod zavajala.
   */
  namig?: string,
): string {
  const koda = napaka.code ?? ''
  const besedilo = napaka.message ?? 'neznana napaka'

  // 23503 = foreign_key_violation. Pri brisanju pomeni, da je na zapis vezano
  // nekaj drugega; pri dodajanju, da se zapis sklicuje na nekaj neobstoječega.
  if (koda === '23503') {
    if (akcija !== 'brisanje') return `⚠ ${kaj} ni mogoče shraniti: sklicuje se na zapis, ki ne obstaja.`
    return namig
      ? `⚠ ${kaj} ni mogoče izbrisati: ${namig}`
      : `⚠ ${kaj} ni mogoče izbrisati: nanj so vezani drugi zapisi (npr. vpisani rezultati tekem). Najprej odstrani te zapise — ali pa obstoječi zapis obdrži in mu le spremeni nastavitve.`
  }

  // 23505 = unique_violation.
  if (koda === '23505') return `⚠ ${kaj} ni mogoče shraniti: tak zapis že obstaja.`

  // 23514 = check_violation.
  if (koda === '23514') return `⚠ ${kaj} ni mogoče shraniti: vrednost ne ustreza pravilom baze.`

  // 23502 = not_null_violation.
  if (koda === '23502') return `⚠ ${kaj} ni mogoče shraniti: manjka obvezen podatek.`

  // 42501 je zavrnitev pravic, PGRST301 pretečena prijava.
  if (koda === '42501' || koda === 'PGRST301') {
    return `⚠ Za ${IMENOVALNIK[akcija]} nimaš pravic. Če si bil dlje časa prijavljen, se odjavi in znova prijavi.`
  }

  return `⚠ ${kaj} ni mogoče shraniti: ${besedilo}`
}

/**
 * RLS zavrne pisanje **brez napake** — PostgREST vrne prazen odgovor. Zato je
 * pri brisanju in urejanju nujen `.select(...)`: če ni ne napake ne vrstic,
 * se ni zgodilo nič, čeprav je videti uspešno.
 */
export function brezUcinka(kaj: string, akcija: Akcija): string {
  return `⚠ ${kaj} ni bilo mogoče ${akcija === 'brisanje' ? 'izbrisati' : 'shraniti'}: baza je zahtevo zavrnila brez pojasnila, najverjetneje zaradi pravic nad to sezono.`
}
