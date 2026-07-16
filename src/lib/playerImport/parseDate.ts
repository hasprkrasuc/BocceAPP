// Vrne YYYY-MM-DD ali null. Podpira Excel serijsko številko in besedilo d.m.yyyy / ISO.
function pad(n: number): string { return String(n).padStart(2, '0') }

export function parseBirthDate(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null

  // Excel serijska številka (dni od 1899-12-30)
  if (typeof value === 'number' || /^\d+$/.test(String(value).trim())) {
    const serial = Number(value)
    if (serial > 0 && serial < 60000) {
      const ms = Date.UTC(1899, 11, 30) + serial * 86400000
      const d = new Date(ms)
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    }
  }

  const s = String(value).trim()

  // Že ISO?
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return s

  // d.m.yyyy
  const dmy = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/)
  if (dmy) {
    const day = Number(dmy[1]), month = Number(dmy[2]), year = Number(dmy[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad(month)}-${pad(day)}`
    }
  }

  return null
}
