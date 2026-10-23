import type { DisciplineType } from '../types'

export const PLACEMENT_POINTS = { p1: 16, p2: 10, p3: 8, p4: 7, p5_8: 3, p9_16: 1 } as const

export type PlacementBucket = 1 | 2 | 3 | 4 | '5-8' | '9-16'

export interface PlacementInput {
  registrations: {
    id: string
    player1_id: string | null
    player2_id: string | null
    // Gost-igralec (guest_players) ima svoj stabilen UUID — šteje v lestvico serije.
    player1_guest_id?: string | null
    player2_guest_id?: string | null
  }[]
  groupTeams: { id: string; registration_id: string }[]
  knockoutMatches: {
    stage: string
    team_a_id: string | null
    team_b_id: string | null
    winner_id: string | null
  }[]
}

export interface PlayerPoints {
  player_id: string
  points: number
  bucket: PlacementBucket
  /** Oznaka mesta za izpis: »2. mesto«, »5.–8. mesto«, »3.–4. mesto« … */
  placeLabel: string
}

/**
 * Oznaka mesta iz koša.
 *
 * Brez tekme za 3. mesto si poraženca polfinala delita bron — takrat oznaka
 * pove »3.–4. mesto«. Zapis je enak kot pri dpPlacement.placementLabel in
 * ekipneUvrstitve, da se razčlenitve na lestvici ne razidejo.
 */
export function oznakaMesta(bucket: PlacementBucket, deljenBron: boolean): string {
  if (bucket === '5-8') return '5.–8. mesto'
  if (bucket === '9-16') return '9.–16. mesto'
  if (bucket === 3 && deljenBron) return '3.–4. mesto'
  return `${bucket}. mesto`
}

/**
 * Discipline, v katerih nastopa PAR. Vse ostale so posamične.
 *
 * Seznam je namenoma kratek in poimensko zaprt: v paru sta samo ŠTAFETA in
 * DVOJICA. Posamezno, igra v krog, hitrostno in natančno izbijanje, bližanje
 * in podaljšek so posamični — tekmovalec nastopa sam.
 */
const PAIR_DISCIPLINES: ReadonlySet<DisciplineType> = new Set(['dvojka', 'stafeta'])

/** Znane discipline — ključi so že normalizirani zapisi. */
const DISCIPLINE_SYNONYMS: ReadonlyMap<string, DisciplineType> = new Map([
  ['trojka', 'trojka'], ['trojke', 'trojka'],
  ['dvojka', 'dvojka'], ['dvojke', 'dvojka'], ['dvojica', 'dvojka'], ['dvojice', 'dvojka'],
  ['posamezno', 'posamezno'], ['posamicno', 'posamezno'],
  ['krog', 'krog'], ['igra v krog', 'krog'], ['igra_v_krog', 'krog'],
  ['hitrostno', 'hitrostno'], ['hitrostno izbijanje', 'hitrostno'],
  ['natancno', 'natancno'], ['natancno izbijanje', 'natancno'],
  ['blizanje', 'blizanje'],
  ['blizanje_krog', 'blizanje_krog'], ['blizanje v krog', 'blizanje_krog'],
  ['stafeta', 'stafeta'], ['stafetno izbijanje', 'stafeta'],
  ['podaljsek', 'podaljsek'],
])

/**
 * Prosto besedilo iz baze → znana disciplina, ali `null`, če je ne prepoznamo.
 *
 * `tournaments.discipline_type` je navaden `text` brez CHECK, zato so se v
 * bazi nabrali različni zapisi iste discipline: DP igra v krog ima vpisano
 * `igra v krog`, tip `DisciplineType` in ligaške discipline pa poznajo `krog`.
 *
 * Razhajanje ni kozmetično. `dpSerije.kljucPrvenstva` istoveti izdaje
 * prvenstva prek `kategorija|disciplina`, zato izdaja z zapisom `krog` NE bi
 * prevzela mesta starejši izdaji z zapisom `igra v krog` — obe bi hkrati
 * nosili točke na rang lestvici. Natanko to napako smo zapirali pri DP
 * dvojice; pusti normalizacijo, da ne zraste nazaj prek pravopisa.
 */
export function normalizirajDisciplino(raw: string | null | undefined): DisciplineType | null {
  if (!raw) return null
  const kljuc = raw.trim().toLowerCase()
    .replace(/[čć]/g, 'c').replace(/š/g, 's').replace(/ž/g, 'z')
    .replace(/\s+/g, ' ')
  return DISCIPLINE_SYNONYMS.get(kljuc) ?? null
}

/**
 * OZNAKE DISCIPLIN — en sam vir za vse izbirnike.
 *
 * Seznami disciplin so bili prej trije in vsak je povedal nekaj drugega:
 * obrazec za ustvarjanje tekmovanja ni ponujal bližanj, mladinske serije ne
 * trojk, tip `DisciplineType` pa pozna oboje. Isti disciplini sta hkrati
 * rekla »Dvojka« in »Dvojice«, »Krog« in »Igra v krog«.
 *
 * Zapis je `Record<DisciplineType, string>` namerno: ko tipu dodaš
 * disciplino, prevajalnik zahteva oznako TUKAJ. Razhajanja torej ne lovi
 * test, ampak typecheck — česar ni mogoče pozabiti.
 */
export const OZNAKE_DISCIPLIN: Readonly<Record<DisciplineType, string>> = {
  posamezno: 'Posamezno',
  dvojka: 'Dvojice',
  trojka: 'Trojke',
  krog: 'Igra v krog',
  hitrostno: 'Hitrostno izbijanje',
  natancno: 'Natančno izbijanje',
  stafeta: 'Štafetno izbijanje',
  blizanje: 'Natančno bližanje',
  blizanje_krog: 'Bližanje v krog',
  podaljsek: 'Podaljšek',
}

/**
 * Discipline, ki se NE tekmujejo na turnirjih in prvenstvih.
 *
 * `podaljsek` je ligaško razsodišče ob izenačenju tekme in ne disciplina, na
 * katero bi se kdo prijavil.
 */
export const NI_ZA_TEKMOVANJA: readonly DisciplineType[] = ['podaljsek']

/**
 * Discipline, ki se tekmujejo na turnirjih in prvenstvih.
 *
 * IZPELJANO iz oznak in ne prepisano. Prepisan seznam je bil prav tista
 * luknja, skozi katero sta padli bližanji: obrazec ju ni ponujal, zato ju ni
 * bilo mogoče vpisati. Zdaj nova disciplina samodejno pride v obrazec ali pa
 * jo je treba zavestno izločiti zgoraj.
 *
 * Vrstni red je namenski (igralne, nato tehnične) in ga drži spodnji seznam;
 * test preverja, da pokrije vse ključe.
 */
const VRSTNI_RED: readonly DisciplineType[] = [
  'posamezno', 'dvojka', 'trojka',
  'krog', 'hitrostno', 'natancno', 'stafeta', 'blizanje', 'blizanje_krog',
  'podaljsek',
]

export const DISCIPLINE_TEKMOVANJ: readonly DisciplineType[] = VRSTNI_RED
  .filter(d => !NI_ZA_TEKMOVANJA.includes(d))

/**
 * Ligaški odstopi od skupnih oznak.
 *
 * Liga govori o »DVOJKA 1/2/3« in »TROJKA«, tekmovanja pa o »Dvojicah« in
 * »Trojkah«. To je resnična razlika v besednjaku, zato je tu zapisana kot
 * izjema z razlogom — in ne kot tih prepis celotnega seznama, kakršen je bil
 * doslej v `LeagueAdmin` in `leagueStatsViews` (ta dva si o isti disciplini
 * nista povedala istega: »Hitrostno zbijanje« proti »Hitrostno izbijanje«).
 */
export const OZNAKE_LIGA: Partial<Readonly<Record<DisciplineType, string>>> = {
  dvojka: 'Dvojka',
  trojka: 'Trojka',
  stafeta: 'Štafeta',
}

/** Oznaka discipline v ligaških zaslonih. */
export function oznakaZaLigo(d: DisciplineType): string {
  return OZNAKE_LIGA[d] ?? OZNAKE_DISCIPLIN[d]
}

/**
 * Discipline mladinskih serij — brez trojk, ki jih mladinci ne igrajo.
 *
 * Izpeljano iz zgornjega seznama in ne prepisano, da oznake ne uidejo
 * narazen; izločitev je ena sama in je tu zapisana z razlogom.
 */
export const DISCIPLINE_MLADINSKE: readonly DisciplineType[] =
  DISCIPLINE_TEKMOVANJ.filter(d => d !== 'trojka')

/**
 * NOSILNA VREDNOST EKIPE ZA ŽREB — vsota velja samo, kadar ekipa res je par.
 *
 * Seštevek `p1 + p2` je bil zapisan na DVEH mestih (seznam nosilcev in
 * `handleDraw`) in nobeno ni vprašalo discipline. Dokler je bila disciplina
 * nespremenljiva, to ni bilo vidno. Odkar jo je mogoče popraviti, pa star par
 * na posamični disciplini obdrži partnerja — njegova nosilna vrednost je
 * vsota dveh igralcev in sede v prvi boben nad prave posameznike.
 *
 * Opozorilo ob spremembi discipline tega ne ujame: vrstica o nosilcih se
 * pokaže šele, kadar so skupine ŽE žrebane, precenitev pa zadene prav
 * tekmovanje, ki še ni žrebano.
 *
 * `seededPotDraw` ureja padajoče po vrednosti, zato je precenitev sistematična
 * in ne naključna.
 */
export function nosilnaVrednost(tocke1: number, tocke2: number, jePar: boolean): number {
  return jePar ? tocke1 + tocke2 : tocke1
}

export function isPairDiscipline(d: DisciplineType): boolean {
  return PAIR_DISCIPLINES.has(d)
}

/**
 * Ali se na tekmovanje prijavlja PAR ali posameznik.
 *
 * Disciplina je merodajna, kadar je vpisana. Kadar ni, je privzetek odvisen od
 * sistema tekmovanja in to NI okrasek:
 *
 *   - `izbijanje` (hitrostno, natančno) — POSAMEZNIK. Pri izbijanju tekmovalec
 *     nastopa sam; edina parna izjema je štafetno izbijanje, ki pa se vpiše
 *     izrecno kot `stafeta`.
 *   - vse ostalo — PAR, kot doslej. Turnirji z dvoboji (Pazina, Kras Open …)
 *     discipline nimajo vpisane in so dvojice; če bi tu privzeli posameznika,
 *     bi se jim prijava tiho spremenila.
 *
 * Neprepoznan zapis discipline šteje enako kot nevpisan — odloči sistem. Tako
 * tipkarska napaka v prostem besedilu ne spremeni tekmovanja v par.
 *
 * Zakaj sploh privzetek: obrazec za ustvarjanje tekmovanja discipline dolgo ni
 * ponujal, zato je `discipline_type` pri vseh skozi vmesnik ustvarjenih
 * tekmovanjih NULL. Prvenstva v hitrostnem izbijanju so zato zahtevala
 * partnerja, čeprav tekmovalec nastopa sam.
 */
export function jeParnoTekmovanje(
  format: string | null | undefined,
  discipline: string | null | undefined,
): boolean {
  const d = normalizirajDisciplino(discipline)
  if (d) return isPairDiscipline(d)
  return format !== 'izbijanje'
}

export function bucketPoints(bucket: PlacementBucket): number {
  switch (bucket) {
    case 1: return PLACEMENT_POINTS.p1
    case 2: return PLACEMENT_POINTS.p2
    case 3: return PLACEMENT_POINTS.p3
    case 4: return PLACEMENT_POINTS.p4
    case '5-8': return PLACEMENT_POINTS.p5_8
    case '9-16': return PLACEMENT_POINTS.p9_16
  }
}

export function tournamentPlayerPoints(input: PlacementInput): PlayerPoints[] {
  const { registrations, groupTeams, knockoutMatches } = input
  const regOfGt = new Map(groupTeams.map(gt => [gt.id, gt.registration_id]))
  const loserGt = (m: PlacementInput['knockoutMatches'][number]): string | null => {
    if (!m.winner_id) return null
    return m.winner_id === m.team_a_id ? m.team_b_id : m.team_a_id
  }

  const bucketByReg = new Map<string, PlacementBucket>()
  const assign = (regId: string | undefined, b: PlacementBucket) => {
    if (regId && !bucketByReg.has(regId)) bucketByReg.set(regId, b)
  }

  const final = knockoutMatches.find(m => m.stage === 'final' && m.winner_id)
  if (final) {
    assign(regOfGt.get(final.winner_id!), 1)
    assign(regOfGt.get(loserGt(final)!), 2)
  }
  const thirdExists = knockoutMatches.some(m => m.stage === 'third_place')
  const third = knockoutMatches.find(m => m.stage === 'third_place' && m.winner_id)
  if (third) {
    assign(regOfGt.get(third.winner_id!), 3)
    assign(regOfGt.get(loserGt(third)!), 4)
  } else if (!thirdExists) {
    // Ni tekme za 3. mesto → oba poraženca polfinala si delita 3. mesto (8 točk).
    for (const m of knockoutMatches.filter(m => m.stage === 'sf' && m.winner_id)) {
      assign(regOfGt.get(loserGt(m)!), 3)
    }
  }
  for (const m of knockoutMatches.filter(m => m.stage === 'qf' && m.winner_id)) {
    assign(regOfGt.get(loserGt(m)!), '5-8')
  }
  // Mesta 9–16 (1 točka) dobijo SAMO ekipe, ki so se uvrstile v glavno izločilno
  // mrežo — tj. nastopile v prvem izločilnem krogu (npr. r16). Ekipe, izpadle v
  // skupinah (uvrstitev 17.+), NE dobijo točk. Tako se točkuje le najboljših 16.
  const KO_ORDER = ['r128', 'r64', 'r32', 'r16', 'qf', 'sf', 'final']
  const firstKoStage = KO_ORDER.find(s => knockoutMatches.some(m => m.stage === s))
  if (firstKoStage) {
    for (const m of knockoutMatches) {
      if (m.stage !== firstKoStage) continue
      for (const gtId of [m.team_a_id, m.team_b_id]) {
        if (gtId) assign(regOfGt.get(gtId), '9-16')
      }
    }
  }

  // Deljen bron: 3. mesto je dodeljeno dvakrat (tekme za 3. mesto ni bilo).
  const deljenBron = [...bucketByReg.values()].filter(b => b === 3).length > 1

  const out: PlayerPoints[] = []
  for (const r of registrations) {
    const bucket = bucketByReg.get(r.id)
    if (!bucket) continue // izven najboljših 16 (izpad v skupinah) → brez točk
    const points = bucketPoints(bucket)
    const placeLabel = oznakaMesta(bucket, deljenBron)
    // Registriran igralec (users) ali gost-igralec (guest_players) — oba imata
    // stabilen UUID in štejeta v lestvico serije. Prosto ime brez UUID se izpusti.
    const p1 = r.player1_id ?? r.player1_guest_id ?? null
    const p2 = r.player2_id ?? r.player2_guest_id ?? null
    if (p1) out.push({ player_id: p1, points, bucket, placeLabel })
    if (p2) out.push({ player_id: p2, points, bucket, placeLabel })
  }
  return out
}
