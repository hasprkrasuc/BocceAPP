/**
 * UJEMANJE LIGAŠKE EKIPE S KLUBOM
 *
 * `league_teams.club_name` je zgodovinski zapis prijave — kakor je bila ekipa
 * prijavljena v tisti sezoni. `league_teams.club_id` je izrecna povezava na
 * klub. Ker je bila povezava dodana pozneje (20260804_01), je pri večini ekip
 * prazna, imena pa se med sezonami pišejo različno:
 *
 *   »Dobrova« ← »BŠK DOBROVA«           (klub ima uradno obliko, prijava kratko)
 *   »Kozlek Zabiče« ← »Zabiče Kozlek«    (obrnjen vrstni red besed)
 *   »Brus Team Idrija« ← »BRUSTEAM IDRIJA« (drugačen razmik)
 *   »Šiška Ljubljana« ← »ŠIŠKA«          (prijava ima kraj zraven, klub ne)
 *
 * Ta motor iz imena PREDLAGA klub. Ničesar ne zapiše in nikoli ne ugiba med
 * dvema enako dobrima kandidatoma — dvoumnost vrne kot seznam, o katerem
 * odloči človek. To je namenoma: napačno pripet klub bi ekipi nadel tuj grb,
 * kar je vidno na vsaki tekmi in ni razvidno iz podatka samega.
 */

export interface KlubZaUjemanje {
  id: string
  name: string
}

/**
 * Kako trdno je ujemanje:
 *   tocno     — ime se po normalizaciji ujema znak za znak
 *   strnjeno  — ujema se, ko odmislimo presledke (»Brus Team« = »BRUSTEAM«)
 *   nabor     — iste besede v drugem vrstnem redu
 *   delno     — besede ene strani so podmnožica besed druge
 */
export type Zanesljivost = 'tocno' | 'strnjeno' | 'nabor' | 'delno'

export interface UjemanjeKluba {
  /** Predlagani klub, kadar je nedvoumen. */
  klub: KlubZaUjemanje | null
  zanesljivost: Zanesljivost | null
  /** Kandidati, kadar jih je na najmočnejši doseženi stopnji več kot en. */
  kandidati: KlubZaUjemanje[]
}

/**
 * Besede, ki same po sebi ne povedo, za kateri klub gre. Uporabljene so SAMO
 * kot straža pri najšibkejši stopnji: »Klub« ali »BK« se ne smeta ujeti s
 * čimerkoli, kar to besedo vsebuje. Pri močnejših stopnjah ne motijo.
 */
const SPLOSNE_BESEDE = new Set([
  'bk', 'bsk', 'bsd', 'bd', 'sd', 'kb', 'bkl',
  'balinarski', 'balinarsko', 'balinarska',
  'sportni', 'sportno', 'sportna', 'sportnega',
  'klub', 'drustvo', 'zveza', 'ekipa', 'team',
])

/**
 * Oznake, ki povedo, da ekipa sploh NI klubska. Območne zveze nastopajo s
 * svojo ekipo (npr. »OBZ POSTOJNA« v ligi U-18) in kluba nimajo — `club_id` je
 * pri njih pravilno prazen (glej migracijo 20260804_01). Brez te straže bi se
 * taka ekipa po besedi »Postojna« ujela s klubom POSTOJNA in na vsaki tekmi
 * nosila tuj grb.
 */
const NEKLUBSKE_OZNAKE = new Set(['obz', 'obzl', 'zveza'])

/** Male črke, šumniki na osnovne, vse nečrkovno v presledek, presledki strnjeni. */
export function normalizirajImeKluba(s: string | null | undefined): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/š/g, 's').replace(/ž/g, 'z').replace(/č/g, 'c').replace(/ć/g, 'c').replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Normalizirano ime brez presledkov — za primerjavo »Brus Team« = »BRUSTEAM«. */
export function strniImeKluba(s: string | null | undefined): string {
  return normalizirajImeKluba(s).replace(/ /g, '')
}

/** Urejen nabor besed brez ponovitev. */
export function besedeImena(s: string | null | undefined): string[] {
  const b = normalizirajImeKluba(s).split(' ').filter(Boolean)
  return [...new Set(b)].sort()
}

const jePodmnozica = (a: string[], b: string[]): boolean => a.every(w => b.includes(w))

const brezUjemanja: UjemanjeKluba = { klub: null, zanesljivost: null, kandidati: [] }

const izid = (zadetki: KlubZaUjemanje[], zanesljivost: Zanesljivost): UjemanjeKluba =>
  zadetki.length === 1
    ? { klub: zadetki[0], zanesljivost, kandidati: [] }
    : { klub: null, zanesljivost, kandidati: zadetki }

/**
 * Poišče klub za ime ekipe. Stopnje se poskusijo od najmočnejše proti
 * najšibkejši; prva, ki sploh kaj najde, obvelja. Šibkejša stopnja se ne
 * poskusi za tem, ko je močnejša našla več kandidatov — z več zadetki na
 * močnejši stopnji šibkejša ne more ničesar razrešiti, le zamegli.
 */
export function najdiKlub(imeEkipe: string | null | undefined, klubi: KlubZaUjemanje[]): UjemanjeKluba {
  const ime = normalizirajImeKluba(imeEkipe)
  if (!ime) return brezUjemanja

  const besede = besedeImena(imeEkipe)
  if (besede.some(w => NEKLUBSKE_OZNAKE.has(w))) return brezUjemanja

  const tocni = klubi.filter(k => normalizirajImeKluba(k.name) === ime)
  if (tocni.length) return izid(tocni, 'tocno')

  const strnjeno = strniImeKluba(imeEkipe)
  const strnjeni = klubi.filter(k => strniImeKluba(k.name) === strnjeno)
  if (strnjeni.length) return izid(strnjeni, 'strnjeno')

  const kljuc = besede.join(' ')
  const poNaboru = klubi.filter(k => besedeImena(k.name).join(' ') === kljuc)
  if (poNaboru.length) return izid(poNaboru, 'nabor')

  // Najšibkejša stopnja. Ime, ki ga sestavljajo same splošne besede (»BK«,
  // »Balinarski klub«), tu ne sme loviti — ujelo bi se s pol seznama.
  if (besede.every(w => SPLOSNE_BESEDE.has(w))) return brezUjemanja
  const delni = klubi.filter(k => {
    const kb = besedeImena(k.name)
    return jePodmnozica(besede, kb) || jePodmnozica(kb, besede)
  })
  if (delni.length) return izid(delni, 'delno')

  return brezUjemanja
}

export interface EkipaZaPovezavo {
  id: string
  club_name: string
  club_id: string | null
}

export interface PredlogPovezave {
  ekipaId: string
  imeEkipe: string
  klub: KlubZaUjemanje
  zanesljivost: Zanesljivost
}

/**
 * Predlogi za vse ekipe, ki kluba še nimajo. Ekipe s že nastavljenim klubom
 * pusti pri miru — obstoječe povezave se ne prepisujejo z ugibanjem.
 */
export function predlagajPovezave(
  ekipe: EkipaZaPovezavo[], klubi: KlubZaUjemanje[],
): PredlogPovezave[] {
  const predlogi: PredlogPovezave[] = []
  for (const e of ekipe) {
    if (e.club_id) continue
    const u = najdiKlub(e.club_name, klubi)
    if (u.klub && u.zanesljivost) {
      predlogi.push({ ekipaId: e.id, imeEkipe: e.club_name, klub: u.klub, zanesljivost: u.zanesljivost })
    }
  }
  return predlogi
}
