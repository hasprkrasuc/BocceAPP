import { parseBirthDate } from './parseDate'

// EMŠO: 13 števk DDMMYYYRRBBBK, K = kontrolna števka po standardnem algoritmu.
export function normalizeEmso(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\D/g, '')
}

export function isValidEmso(value: string | number | null | undefined): boolean {
  const s = normalizeEmso(value)
  if (s.length !== 13) return false
  const weights = [7, 6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(s[i]) * weights[i]
  const mod = sum % 11
  const m = 11 - mod
  const expected = (m === 10 || m === 11) ? 0 : m
  return expected === Number(s[12])
}

/**
 * Hrvaški OIB: 11 števk, kontrolna po ISO 7064 MOD 11,10.
 *
 * V bazi so tujci — nastopajo v naših ligah — in slovenskega EMŠO nimajo. Njihova
 * oznaka pristane v istem stolpcu `users.emso`, ker ima ta pomen »uradna oznaka
 * osebe«, ne »slovenski EMŠO«. Brez tega preverjanja jih je aplikacija označevala
 * za pokvarjene zapise, strežnik pa jih ob uvozu sploh ni sprejel.
 */
export function isValidOib(value: string | number | null | undefined): boolean {
  const s = normalizeEmso(value)
  if (s.length !== 11) return false
  let a = 10
  for (let i = 0; i < 10; i++) {
    a = (a + Number(s[i])) % 10
    if (a === 0) a = 10
    a = (a * 2) % 11
  }
  const k = 11 - a
  return (k === 10 ? 0 : k) === Number(s[10])
}

/**
 * Ali je vrednost sprejemljiva uradna oznaka osebe — slovenski EMŠO ali tuja.
 * Uporabi to, kadar te zanima »je ta zapis v redu«; isValidEmso pusti za primere,
 * kjer je pomembno prav slovensko poreklo oznake.
 */
export function isValidPersonalId(value: string | number | null | undefined): boolean {
  return isValidEmso(value) || isValidOib(value)
}

/**
 * Datum rojstva, ki ga kodira EMŠO (prvih sedem števk DDMMYYY), v obliki
 * YYYY-MM-DD. Null pri tuji oznaki, pokvarjenem zapisu ali nemogočem datumu.
 *
 * Trimestna letnica pomeni tisočletje: 9xx je 19xx, 0xx pa 20xx.
 */
export function datumIzEmso(value: string | number | null | undefined): string | null {
  const s = normalizeEmso(value)
  if (s.length !== 13) return null
  const dan = Number(s.slice(0, 2))
  const mesec = Number(s.slice(2, 4))
  const trimestna = Number(s.slice(4, 7))
  if (dan < 1 || dan > 31 || mesec < 1 || mesec > 12) return null
  const leto = trimestna >= 800 ? 1000 + trimestna : 2000 + trimestna
  const d = new Date(Date.UTC(leto, mesec - 1, dan))
  // Zavrne 31. februar in podobno: Date bi ga tiho prevalil v naslednji mesec.
  if (d.getUTCMonth() !== mesec - 1 || d.getUTCDate() !== dan) return null
  return `${leto}-${String(mesec).padStart(2, '0')}-${String(dan).padStart(2, '0')}`
}

/**
 * Opozorilo o vpisani oznaki osebe, ali null, kadar je vse v redu.
 *
 * Pokrije tri napake, ki jih iz same številke ni videti:
 *
 *   1. zapis, ki ni ne EMŠO ne tuja oznaka (Excelov znanstveni zapis, odrezan konec)
 *   2. neveljavna kontrolna števka
 *   3. EMŠO kodira drug datum rojstva, kot je vpisan
 *
 * Tretja je najbolj zahrbtna: obe vrednosti sta videti razumni, le ena od njiju
 * je napačna. Tako se je našla napaka pri igralcu, kjer je EMŠO kodiral 6. junij,
 * vpisan datum pa 8. junij — razlika ene same števke.
 *
 * Datum rojstva je v bazi zapisan v dveh oblikah (ISO in d.m.yyyy), zato gre
 * skozi parseBirthDate; brez tega bi vsaka slovenska oblika lažno opozarjala.
 */
export function opozoriloOEmso(
  emso: string | null | undefined,
  dateOfBirth: string | null | undefined,
): string | null {
  if (!emso) return null
  const cifre = normalizeEmso(emso)
  if (cifre.length !== 13 && cifre.length !== 11) {
    return `Pokvarjen zapis — ${cifre.length} števk namesto 13 (oziroma 11 pri tuji oznaki).`
  }
  if (!isValidPersonalId(cifre)) {
    return 'Kontrolna števka se ne izide — vrednost je najbrž napačno prepisana.'
  }
  const izEmso = datumIzEmso(cifre)
  const vpisan = parseBirthDate(dateOfBirth ?? null)
  if (izEmso && vpisan && izEmso !== vpisan) {
    return `EMŠO kodira datum rojstva ${izEmso}, vpisan pa je ${vpisan}.`
  }
  return null
}
