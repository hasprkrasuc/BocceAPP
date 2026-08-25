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
