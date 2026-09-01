import {
  buildBracketFromFirstRound, knockoutPropagation,
  type PlannedMatch, type KoMatchRow,
} from './knockout'

/**
 * POKAL BZS — izločilno tekmovanje klubskih ekip.
 *
 * Pajek se NE hrani v bazi. Vsaka ekipa ima ob žrebu dodeljeno številko od 1
 * do velikosti pajka (`league_teams.draw_number`), in ta številka JE mesto v
 * pajku: 1 igra proti 2, 3 proti 4 in tako naprej. Iz samih številk je zato
 * izpeljiv cel pajek — kdo je prost, kdo koga čaka, kdo se s kom lahko sreča
 * šele v finalu. Tabela parov bi bila drugi zapis istega podatka in bi se ob
 * prvem popravku žreba razšla z njim.
 *
 * Hrani se samo tisto, česar ni mogoče izpeljati: odigrane tekme. Te so
 * navadne vrstice v `league_fixtures` (isti zapisnik kot liga), pokalu pa ni
 * treba vedeti nič drugega kot to, kdo je tekmo dobil.
 *
 * PROSTA MESTA. Kadar številke ni izžrebal nihče, je nasprotnik prost in ekipa
 * napreduje brez tekme. V sezoni 2026/27 je bilo 47 ekip na 64 mestih, torej
 * 17 prostih mest — vseh 16 nosilcev in Loka 1000.
 */

/** Ekipa v pokalu: ligaška ekipa in njena žrebana številka (mesto v pajku). */
export interface PokalEkipa {
  teamId: string
  /** 1 .. velikost pajka. Dve ekipi ne moreta imeti iste. */
  drawNumber: number
}

/** Odigrana pokalna tekma, kot pride iz `league_fixtures`. */
export interface PokalIzid {
  homeTeamId: string
  awayTeamId: string
  /** NULL, dokler tekma ni odigrana. Pokal neodločenega izida ne pozna. */
  winnerTeamId: string | null
}

/** Privzeta velikost pajka — 64 mest (47 prijavljenih ekip v sezoni 2026/27). */
export const POKAL_VELIKOST = 64

function preveri(ekipe: PokalEkipa[], velikost: number): void {
  if ((velikost & (velikost - 1)) !== 0 || velikost < 2) {
    throw new Error(`Velikost pajka mora biti potenca števila 2, dobil ${velikost}`)
  }
  if (ekipe.length > velikost) {
    throw new Error(`Ekip (${ekipe.length}) je več kot mest v pajku (${velikost})`)
  }
  const videne = new Set<number>()
  for (const e of ekipe) {
    if (!Number.isInteger(e.drawNumber) || e.drawNumber < 1 || e.drawNumber > velikost) {
      throw new Error(`Žrebana številka ${e.drawNumber} je zunaj razpona 1–${velikost}`)
    }
    if (videne.has(e.drawNumber)) {
      throw new Error(`Žrebana številka ${e.drawNumber} je dodeljena dvakrat`)
    }
    videne.add(e.drawNumber)
  }
}

/**
 * Pari prvega kroga po žrebanih številkah: (1,2), (3,4) … (63,64).
 * Manjkajoča številka pomeni prosto mesto — nasprotnika ni.
 */
export function pariPrvegaKroga(
  ekipe: PokalEkipa[],
  velikost = POKAL_VELIKOST,
): Array<[string | null, string | null]> {
  preveri(ekipe, velikost)
  const poMestu = new Map(ekipe.map(e => [e.drawNumber, e.teamId]))
  const pari: Array<[string | null, string | null]> = []
  for (let mesto = 1; mesto <= velikost; mesto += 2) {
    pari.push([poMestu.get(mesto) ?? null, poMestu.get(mesto + 1) ?? null])
  }
  return pari
}

/** Neurejen ključ para ekip — tekma je ista ne glede na to, kdo je domači. */
function kljucPara(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/**
 * Celoten pajek: prvi krog iz žrebanih številk, nadaljnji krogi napolnjeni z
 * zmagovalci odigranih tekem.
 *
 * Zmagovalci se prelivajo v več prehodih: zmagovalec 1. kroga napolni mesto v
 * 2. krogu, šele nato je tam znan par, ki ga je mogoče poiskati med izidi.
 * Zato zanka teče, dokler se kaj spreminja.
 */
export function pokalniPajek(
  ekipe: PokalEkipa[],
  izidi: PokalIzid[] = [],
  velikost = POKAL_VELIKOST,
): PlannedMatch[] {
  const nacrt = buildBracketFromFirstRound(pariPrvegaKroga(ekipe, velikost), { thirdPlace: false })

  const zmagovalci = new Map<string, string>()
  for (const i of izidi) {
    if (i.winnerTeamId) zmagovalci.set(kljucPara(i.homeTeamId, i.awayTeamId), i.winnerTeamId)
  }

  const vrstice: KoMatchRow[] = nacrt.map(m => ({
    id: `${m.stage}-${m.matchNumber}`,
    stage: m.stage,
    match_number: m.matchNumber,
    team_a_id: m.teamA,
    team_b_id: m.teamB,
    winner_id: m.winner,
    is_bye: m.isBye,
  }))
  const poId = new Map(vrstice.map(v => [v.id, v]))

  // Največ toliko prehodov, kolikor je krogov — več jih ni mogoče potrebovati.
  for (let obhod = 0; obhod < vrstice.length; obhod++) {
    let spremenjeno = false

    for (const u of knockoutPropagation(vrstice)) {
      const cilj = poId.get(u.id)
      if (!cilj) continue
      if (u.slot === 'team_a_id') cilj.team_a_id = u.teamId
      else cilj.team_b_id = u.teamId
      spremenjeno = true
    }

    for (const v of vrstice) {
      if (v.winner_id || !v.team_a_id || !v.team_b_id) continue
      const zmagovalec = zmagovalci.get(kljucPara(v.team_a_id, v.team_b_id))
      if (zmagovalec) { v.winner_id = zmagovalec; spremenjeno = true }
    }

    if (!spremenjeno) break
  }

  return vrstice.map(v => ({
    stage: v.stage,
    matchNumber: v.match_number,
    teamA: v.team_a_id,
    teamB: v.team_b_id,
    isBye: v.is_bye,
    winner: v.winner_id,
  }))
}

// ────────────────────────────────────────────────────────────────
// DOMAČIN POKALNE TEKME
//
// Pravilo BZS: ekipa iz NIŽJEGA ranga (nižje lige) je vedno domačin — pokal
// naj malim klubom pripelje velike na domače igrišče. Rang se izpelje iz
// tega, kje ima klub ekipo v tekoči sezoni; pri enakem rangu ostane žrebni
// vrstni red (prva številka doma), ker lanske uvrstitve baza ne pozna.
// ────────────────────────────────────────────────────────────────

/** Rang, ko kluba ni v nobeni članski ligi tekoče sezone — šteje kot najnižji. */
export const RANG_NEZNAN = 9

/**
 * Rang članske lige: manjša številka = višja liga. Ženske in mladinske lige
 * ranga NE določajo (pokal je člansko tekmovanje) — zanje vrne null, prav
 * tako za pokal sam in sezone brez ranga.
 */
export function rangLige(
  tier: string | null | undefined,
  category: string | null | undefined,
): number | null {
  if (category && category !== 'men' && category !== 'mixed') return null
  if (tier === 'super_liga') return 1
  if (tier === '1_liga') return 2
  if (tier === '2_liga_vzhod' || tier === '2_liga_zahod') return 3
  if (tier === 'obz') return 4
  return null
}

/**
 * Stran pokalne tekme: [domači, gostujoči]. Domačin je ekipa z VIŠJO številko
 * ranga (nižja liga); pri enakem rangu ostane podani (žrebni) vrstni red.
 */
export function pokalniDomacin(
  a: string,
  b: string,
  rang: Map<string, number>,
): [string, string] {
  const ra = rang.get(a) ?? RANG_NEZNAN
  const rb = rang.get(b) ?? RANG_NEZNAN
  return rb > ra ? [b, a] : [a, b]
}

/**
 * Končna uvrstitev pokala iz pajka: zmagovalec finala 1., poraženec 2.,
 * poraženca polfinalov si delita 3. mesto (tekme za 3. mesto v pokalu ni —
 * enako kot deljeni bron na DP). Vrne samo odločena mesta: dokler finale ni
 * odigran, ni nobenega.
 */
export function pokalneUvrstitve(pajek: PlannedMatch[]): Map<string, number> {
  const mesta = new Map<string, number>()
  const finale = pajek.find(m => m.stage === 'final')
  if (!finale?.winner || !finale.teamA || !finale.teamB) return mesta
  mesta.set(finale.winner, 1)
  mesta.set(finale.winner === finale.teamA ? finale.teamB : finale.teamA, 2)
  for (const sf of pajek.filter(m => m.stage === 'sf')) {
    if (!sf.winner || !sf.teamA || !sf.teamB) continue
    const porazenec = sf.winner === sf.teamA ? sf.teamB : sf.teamA
    if (!mesta.has(porazenec)) mesta.set(porazenec, 3)
  }
  return mesta
}

/** Ekipe, ki so v prvem krogu proste (nasprotnika ni izžrebal nihče). */
export function prostiVPrvemKrogu(ekipe: PokalEkipa[], velikost = POKAL_VELIKOST): string[] {
  return pariPrvegaKroga(ekipe, velikost)
    .filter(([a, b]) => (a === null) !== (b === null))
    .map(([a, b]) => (a ?? b)!)
}

/** Pari prvega kroga, ki se res igrajo (obe strani zasedeni). */
export function tekmePrvegaKroga(
  ekipe: PokalEkipa[],
  velikost = POKAL_VELIKOST,
): Array<[string, string]> {
  return pariPrvegaKroga(ekipe, velikost)
    .filter((p): p is [string, string] => p[0] !== null && p[1] !== null)
}
