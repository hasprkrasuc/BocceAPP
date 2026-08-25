import type { ParsedPlayer, ExistingUser, ImportRow } from './types'
import { isValidPersonalId, normalizeEmso } from './emso'

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

// Deljeno tudi s strežniško funkcijo api/import-players.ts — sinhronizacijo varuje
// test api-shared-sync.test.ts.
//
// Ali uvoženi EMŠO nasprotuje tistemu, ki ga obstoječi zapis že ima? Vprašanje je
// pomembno samo pri ŠIBKEM ujemanju (po imenu), kjer bi drugačen EMŠO pomenil, da
// smo najbrž našli napačno osebo.
//
// Pokvarjen obstoječi EMŠO ne šteje za nasprotovanje: v bazi jih je precej
// shranjenih kot Excelov prikaz števila ("1.70196E+12"). Takšnega je treba
// popraviti, ne pa zaradi njega zavrniti uvoza — sicer se oseba ob vsakem uvozu
// podvoji, kar je natanko tisto, kar naj bi ujemanje preprečilo.
export function emsoNasprotuje(obstojeci: string | null, uvozeni: string | null): boolean {
  if (!obstojeci || !uvozeni) return false
  const stari = normalizeEmso(obstojeci)
  if (!/^(\d{11}|\d{13})$/.test(stari)) return false
  return stari !== normalizeEmso(uvozeni)
}

/**
 * Statusi za predogled uvoza.
 *
 * Ključi se poskusijo po vrsti, od najmočnejšega proti najšibkejšemu, in prvi
 * zadetek obvelja:
 *
 *   1. e-naslov iz aplikacije  — istovetnost, ne ugibanje
 *   2. EMŠO                    — enolična oznaka osebe
 *   3. ime + poln datum rojstva
 *   4. ime + letnica rojstva, zoženo s športno številko in ostankom EMŠO
 *
 * Da veriga sploh obstaja, je bistveno: prej je prisoten EMŠO pomenil konec
 * iskanja, zato je igralec, ki ima v bazi pokvarjen EMŠO, ob vsakem uvozu izpadel
 * kot nov in se podvojil. Ravno tako so nastali dvojniki, ki jih je bilo treba
 * ročno združevati.
 */
export function computeStatuses(
  players: ParsedPlayer[],
  existing: ExistingUser[],
  targetClubId: string,
): ImportRow[] {
  const byEmso = new Map<string, ExistingUser>()
  for (const u of existing) if (u.emso) byEmso.set(u.emso, u)
  // Normalizacija e-naslova mora biti enaka kot na strežniku (mala črka, obrezano).
  const byEmail = new Map<string, ExistingUser>()
  for (const u of existing) if (u.email) byEmail.set(u.email.trim().toLowerCase(), u)

  const napaka = (p: ParsedPlayer, error: string, warning: string | null): ImportRow =>
    ({ player: p, status: 'error', existingUserId: null, currentClubId: null, error, warning })

  return players.map((p): ImportRow => {
    // Neveljavna kontrolna števka je pri realnih podatkih pogosto zgolj tipkarska
    // napaka kluba (ista napaka se ponovi vsako sezono) — igralec je še vedno prepoznaven,
    // zato tega NE blokiramo, le opozorimo. Oznako kljub temu uporabimo za ujemanje po enakosti.
    //
    // Preverjamo isValidPersonalId in ne isValidEmso: v ligah nastopajo tujci, ki
    // slovenskega EMŠO nimajo. Njihov hrvaški OIB je pravilen podatek in ga ni
    // pošteno vsako sezono označevati za napako.
    const warning = p.emso && !isValidPersonalId(p.emso)
      ? 'Neveljavna kontrolna števka oznake osebe — preveri pri klubu'
      : null

    let match: ExistingUser | undefined
    // Ujemanje po imenu je šibko: tam drugačen EMŠO pomeni, da smo najbrž našli
    // napačno osebo. Pri e-pošti in EMŠO je istovetnost dokazana, zato tam ne velja.
    let sibko = false

    if (p.email) match = byEmail.get(p.email.trim().toLowerCase())

    if (!match && p.emso) match = byEmso.get(p.emso)

    if (!match && p.birthDate) {
      const target = norm(p.fullName)
      const hits = existing.filter(u => u.date_of_birth !== null && u.date_of_birth === p.birthDate && norm(u.full_name) === target)
      // Strežnik dvoumnosti ne ugiba, zato je tudi predogled ne sme — sicer bi pokazal
      // prvega od več kandidatov, uvoz pa bi vrstico zavrnil.
      if (hits.length > 1) {
        return napaka(p, 'Več kandidatov z istim imenom in datumom — potreben EMŠO', warning)
      }
      match = hits[0]
      sibko = !!match
    }

    if (!match && p.birthYear !== null) {
      // Zamaskiran izvoz iz evidence: poln datum in EMŠO sta zakrita, ostane ime
      // in letnica. Ključ je šibkejši, zato ga zožimo s športno številko in
      // ostankom EMŠO, dvoumnost pa je napaka enako kot zgoraj.
      const target = norm(p.fullName)
      const kandidati = existing.filter(u => u.birth_year !== null && u.birth_year === p.birthYear && norm(u.full_name) === target)
      const zozeni = zoziKandidate(kandidati, p.emsoSuffix, p.sportNumber)
      if (zozeni.length > 1) {
        return napaka(p, 'Več kandidatov z istim imenom in letnico rojstva — potrebna je športna številka ali neokrnjen izvoz', warning)
      }
      match = zozeni[0]
      sibko = !!match
    }

    if (!match) {
      // Novega ustvarimo le, kadar ga bo naslednji uvoz znal spet najti — torej
      // kadar s sabo prinese EMŠO ali poln datum rojstva. Zapis brez obojega bi se
      // ob vsakem uvozu podvojil, zato ga strežnik tudi ne bi ustvaril.
      if (p.emso || p.birthDate) {
        return { player: p, status: 'new', existingUserId: null, currentClubId: null, error: null, warning }
      }
      if (p.birthYear !== null) {
        return napaka(p, 'Igralca ni v bazi — iz zamaskiranega izvoza ga ni mogoče varno ustvariti (dodaj ga z registracijskim obrazcem ali ročno)', warning)
      }
      // Brez EMŠO, datuma in letnice ujemanje ni mogoče: brez te straže bi se
      // null === null izšlo in bi se ujeli zgolj po imenu.
      return napaka(p, 'Brez EMŠO in datuma rojstva', warning)
    }

    if (sibko && emsoNasprotuje(match.emso, p.emso)) {
      return napaka(p, 'Ujemanje po imenu, a obstoječi zapis ima drugačen EMŠO — preveri, ali gre za isto osebo', warning)
    }

    if (match.club_id && match.club_id !== targetClubId) {
      return { player: p, status: 'transfer', existingUserId: match.id, currentClubId: match.club_id, error: null, warning }
    }
    return { player: p, status: 'update', existingUserId: match.id, currentClubId: match.club_id, error: null, warning }
  })
}
