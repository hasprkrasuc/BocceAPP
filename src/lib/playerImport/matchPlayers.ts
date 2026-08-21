import type { ParsedPlayer, ExistingUser, ImportRow } from './types'
import { isValidEmso } from './emso'

// Deljeno tudi s strežniško funkcijo api/import-players.ts — ujemanje brez EMŠO
// se mora na obeh straneh normalizirati enako, sicer predogled in uvoz razideta.
export const normalizeName = (s: string | null): string =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/š/g, 's').replace(/ž/g, 'z').replace(/č/g, 'c').replace(/\s+/g, ' ').trim()

const norm = normalizeName

// Deljeno tudi s strežniško funkcijo api/import-players.ts — sinhronizacijo varuje
// test api-shared-sync.test.ts.
//
// Zoži kandidate, ki se že ujemajo po imenu in letnici rojstva. Oboje, športna
// številka in ostanek EMŠO, je zgolj RAZLOČEVALEC: ne moreta nikogar potegniti v
// nabor, lahko ga samo zmanjšata. Zato zožimo le, kadar kaj ostane — obstoječi
// zapis brez številke licence ne sme izpasti samo zato, ker izvoz številko ima.
export function zoziKandidate<T extends { emso: string | null; license_number: string | null }>(
  kandidati: T[], emsoSuffix: string | null, sportnaSt: string | null,
): T[] {
  let zozeni = kandidati
  if (sportnaSt) {
    const poStevilki = zozeni.filter(k => (k.license_number || '').trim() === sportnaSt.trim())
    if (poStevilki.length > 0) zozeni = poStevilki
  }
  if (emsoSuffix) {
    const poOstanku = zozeni.filter(k => (k.emso || '').endsWith(emsoSuffix))
    if (poOstanku.length > 0) zozeni = poOstanku
  }
  return zozeni
}

export function computeStatuses(
  players: ParsedPlayer[],
  existing: ExistingUser[],
  targetClubId: string,
): ImportRow[] {
  const byEmso = new Map<string, ExistingUser>()
  for (const u of existing) if (u.emso) byEmso.set(u.emso, u)

  const napaka = (p: ParsedPlayer, error: string, warning: string | null): ImportRow =>
    ({ player: p, status: 'error', existingUserId: null, currentClubId: null, error, warning })

  return players.map((p): ImportRow => {
    // Neveljavna kontrolna števka EMŠO je pri realnih podatkih pogosto zgolj tipkarska
    // napaka kluba (ista napaka se ponovi vsako sezono) — igralec je še vedno prepoznaven,
    // zato tega NE blokiramo, le opozorimo. EMŠO kljub temu uporabimo za ujemanje po enakosti.
    const warning = p.emso && !isValidEmso(p.emso)
      ? 'Neveljavna kontrolna števka EMŠO — preveri pri klubu'
      : null

    let match: ExistingUser | undefined
    if (p.emso) {
      match = byEmso.get(p.emso)
    } else if (p.birthDate) {
      // Brez EMŠO se opremo na ime + poln datum rojstva.
      const target = norm(p.fullName)
      const hits = existing.filter(u => u.date_of_birth !== null && u.date_of_birth === p.birthDate && norm(u.full_name) === target)
      // Strežnik dvoumnosti ne ugiba, zato je tudi predogled ne sme — sicer bi pokazal
      // prvega od več kandidatov, uvoz pa bi vrstico zavrnil.
      if (hits.length > 1) {
        return napaka(p, 'Več kandidatov z istim imenom in datumom — potreben EMŠO', warning)
      }
      match = hits[0]
    } else if (p.birthYear !== null) {
      // Zamaskiran izvoz iz evidence: poln datum in EMŠO sta zakrita, ostane ime
      // in letnica. Ključ je šibkejši, zato ga zožimo s športno številko in
      // ostankom EMŠO, dvoumnost pa je napaka enako kot zgoraj.
      const target = norm(p.fullName)
      const kandidati = existing.filter(u => u.birth_year !== null && u.birth_year === p.birthYear && norm(u.full_name) === target)
      const zozeni = zoziKandidate(kandidati, p.emsoSuffix, p.sportNumber)
      if (zozeni.length > 1) {
        return napaka(p, 'Več kandidatov z istim imenom in letnico rojstva — potrebna je športna številka ali neokrnjen izvoz', warning)
      }
      // Novega igralca iz zamaskiranega izvoza NE ustvarimo. Zapis brez EMŠO in
      // brez datuma rojstva naslednji uvoz ne bi našel in bi ga vsakič podvojil;
      // strežnik ga iz istega razloga tudi ne bi ustvaril.
      if (zozeni.length === 0) {
        return napaka(p, 'Igralca ni v bazi — iz zamaskiranega izvoza ga ni mogoče varno ustvariti (dodaj ga z registracijskim obrazcem ali ročno)', warning)
      }
      match = zozeni[0]
    } else {
      // Brez EMŠO, datuma in letnice ujemanje ni mogoče: brez te straže bi se
      // null === null izšlo in bi se ujeli zgolj po imenu.
      return napaka(p, 'Brez EMŠO in datuma rojstva', warning)
    }

    if (!match) return { player: p, status: 'new', existingUserId: null, currentClubId: null, error: null, warning }
    if (match.club_id && match.club_id !== targetClubId) {
      return { player: p, status: 'transfer', existingUserId: match.id, currentClubId: match.club_id, error: null, warning }
    }
    return { player: p, status: 'update', existingUserId: match.id, currentClubId: match.club_id, error: null, warning }
  })
}
