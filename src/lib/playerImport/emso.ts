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
