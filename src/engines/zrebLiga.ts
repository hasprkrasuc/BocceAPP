/**
 * LIGAŠKA PRAVILA ŽREBA
 *
 * Prevede sezono v `ZrebOpis` za splošni pogon. Vsa ligaška pravila živijo tu;
 * pogon jih ne pozna.
 *
 * Dve obliki:
 *  - `flat` in `split` — ena skupina, številke 1..N
 *  - `groups` — najprej se žrebata skupini A/B po parih nosilcev, nato številke
 *    1..6 znotraj vsake skupine
 *
 * Ekipi, ki si delita rezervno igrišče, morata dobiti številki iz para, ki v
 * nobenem krogu ni obe domači (glej `veljavniPariIgrisc`).
 */
import { veljavniPariIgrisc } from './berger'
import type { Korak, ZrebOpis, ZrebStanje } from './zreb'

export interface LigaEkipa {
  id: string
  ime: string
  shared_venue_key: string | null
}

export interface LigaNastavitve {
  format: 'flat' | 'groups' | 'split'
  double_round: boolean
  berger_mirror: boolean
}

/** Predal 0 = skupine (groups) ali edini nabor številk (flat/split). */
export const PREDAL_SKUPINE = 0
export const PREDAL_A = 1
export const PREDAL_B = 2

/** Pari ekip, ki si delijo igrišče. Vrne pare id-jev; ključi z eno ekipo se ignorirajo. */
export function soigriscniPari(ekipe: LigaEkipa[]): Array<[string, string]> {
  const poKljucu = new Map<string, string[]>()
  for (const e of ekipe) {
    if (!e.shared_venue_key) continue
    const seznam = poKljucu.get(e.shared_venue_key) ?? []
    seznam.push(e.id)
    poKljucu.set(e.shared_venue_key, seznam)
  }
  const pari: Array<[string, string]> = []
  for (const [, ids] of poKljucu) {
    if (ids.length === 2) pari.push([ids[0], ids[1]])
  }
  return pari
}

/**
 * Preveri, ali je žreb sploh izvedljiv. Vrne napake v slovenščini; prazen
 * seznam pomeni, da se obred lahko začne. Namenoma se izvede PRED obredom, da
 * se ne zatakne sredi dvorane.
 */
export function preveriIzvedljivost(ekipe: LigaEkipa[], nastavitve: LigaNastavitve): string[] {
  const napake: string[] = []
  const poKljucu = new Map<string, string[]>()
  for (const e of ekipe) {
    if (!e.shared_venue_key) continue
    const s = poKljucu.get(e.shared_venue_key) ?? []
    s.push(e.ime)
    poKljucu.set(e.shared_venue_key, s)
  }
  for (const [kljuc, imena] of poKljucu) {
    if (imena.length > 2) {
      napake.push(`Igrišče „${kljuc}“ si deli ${imena.length} ekip (${imena.join(', ')}). Pravilo o razliki številk velja samo za dve.`)
    }
  }
  if (nastavitve.format === 'groups' && ekipe.length !== 12) {
    napake.push(`Skupinska liga zahteva 12 ekip, sezona jih ima ${ekipe.length}.`)
  }
  if (nastavitve.format !== 'groups' && (ekipe.length < 2 || ekipe.length > 12)) {
    napake.push(`Bergerjev razpored zahteva 2 do 12 ekip, sezona jih ima ${ekipe.length}.`)
  }
  return napake
}

/**
 * Ali je razpored tega formata dvokrožen.
 *
 * Stolpca `double_round` NI mogoče prenesti naravnost. V `src/types.ts` je
 * dokumentiran kot »samo format='flat'«, migracija ga zapolni le za `flat`, in
 * obrazec sezone ga pri drugih formatih sploh ne pokaže — zato pri skupinskih in
 * razdelitvenih sezonah večno ostane `false`. Resnica je drugačna: faza 1
 * skupinske lige JE dvokrožna (`LeagueAdmin` jo tako generira), faza 1
 * razdelitvene pa enokrožna.
 *
 * Napaka je nevarna v eno smer. Pari enokrožnega razporeda so nadmnožica
 * dvokrožnih, zato bi napačni `false` pri skupinski ligi ponudil par, ki v
 * dvokrožni sezoni ni varen — in ekipi bi bili v nekem krogu obe domači, kar je
 * natanko tisto, čemur se pravilo izogiba.
 */
export function jeDvokrozno(nastavitve: LigaNastavitve): boolean {
  if (nastavitve.format === 'groups') return true
  if (nastavitve.format === 'split') return false
  return nastavitve.double_round
}

/** Partnerske številke, ki jih sme dobiti soigriščna ekipa ob številki `n`. */
function partnerskeStevilke(n: number, pari: Array<[number, number]>): number[] {
  const out: number[] = []
  for (const [a, b] of pari) {
    if (a === n) out.push(b)
    if (b === n) out.push(a)
  }
  return out
}

/**
 * Korak za en nabor številk 1..velikost: najprej soigriščni pari, nato ostali.
 * Vrne dva koraka z istim predalom — vrstni red je bistven, ker bi sicer lahko
 * ekipe brez omejitve zasedle številke tako, da za par ne ostane veljavna
 * razlika.
 */
function korakiZaNabor(
  predal: number,
  /** Člani nabora; funkcija stanja, ker so pri skupinski ligi znani šele po fazi A. */
  clani: (stanje: ZrebStanje) => string[],
  velikost: number,
  pariIgrisc: Array<[string, string]>,
  nastavitve: LigaNastavitve,
  naziv: string,
): Korak[] {
  const stevilke = () => Array.from({ length: velikost }, (_, i) => i + 1)
  const veljavniPari = veljavniPariIgrisc(velikost, jeDvokrozno(nastavitve), nastavitve.berger_mirror)

  /** Pari, ki sta oba v tem naboru. */
  const mojiPari = (s: ZrebStanje) => {
    const v = new Set(clani(s))
    return pariIgrisc.filter(([a, b]) => v.has(a) && v.has(b))
  }
  const prviIzParov = (s: ZrebStanje) => mojiPari(s).map(([a]) => a)
  const drugiIzParov = (s: ZrebStanje) => new Set(mojiPari(s).map(([, b]) => b))

  const prosteV = (s: ZrebStanje) => {
    const vzete = new Set(Object.values(s.dodeljene[predal] ?? {}))
    return stevilke().filter(n => !vzete.has(n))
  }

  const korakPari: Korak = {
    naziv: `${naziv} — ekipe s skupnim igriščem`,
    predal,
    udelezenci: prviIzParov,
    stevilke,
    veljavne: (s) => {
      const proste = new Set(prosteV(s))
      // veljavna je le številka, ki ima prosto tudi partnersko
      return [...proste].filter(n => partnerskeStevilke(n, veljavniPari).some(p => proste.has(p)))
    },
    posledice: (s, id, n) => {
      const par = mojiPari(s).find(([a]) => a === id)
      if (!par) return []
      const proste = new Set(prosteV(s))
      proste.delete(n)
      const moznosti = partnerskeStevilke(n, veljavniPari).filter(p => proste.has(p))
      if (moznosti.length === 0) throw new Error(`za ${id} ni proste partnerske številke`)
      return [{
        udelezenecId: par[1],
        stevilka: moznosti[0],
        samodejno: true,
        razlog: 'skupno rezervno igrišče',
      }]
    },
  }

  const korakOstali: Korak = {
    naziv,
    predal,
    udelezenci: (s) => {
      const drugi = drugiIzParov(s)
      const prvi = new Set(prviIzParov(s))
      return clani(s).filter(id => !drugi.has(id) && !prvi.has(id))
    },
    stevilke,
    veljavne: (s) => prosteV(s),
  }

  return [korakPari, korakOstali]
}

/** Sestavi opis žreba za ligaško sezono. */
export function ligaskiOpis(
  nastavitve: LigaNastavitve,
  ekipe: LigaEkipa[],
  nosilniVrstniRed: string[],
): ZrebOpis {
  const udelezenci = ekipe.map(e => ({ id: e.id, ime: e.ime }))
  const pari = soigriscniPari(ekipe)

  if (nastavitve.format !== 'groups') {
    return {
      udelezenci,
      koraki: korakiZaNabor(
        PREDAL_SKUPINE, () => ekipe.map(e => e.id), ekipe.length, pari, nastavitve, 'Žrebane številke',
      ),
    }
  }
  return { udelezenci, koraki: korakiSkupinskeLige(ekipe, pari, nastavitve, nosilniVrstniRed) }
}

/** Zapolni Task 7 — do takrat skupinska liga ni podprta. */
function korakiSkupinskeLige(
  _ekipe: LigaEkipa[], _pari: Array<[string, string]>,
  _nastavitve: LigaNastavitve, _nosilniVrstniRed: string[],
): Korak[] {
  throw new Error('skupinska liga še ni podprta')
}

/**
 * Ligaške invariante, ki jih splošni pogon ne more poznati. Vrne napake v
 * slovenščini; prazen seznam = izid je veljaven. Kliče se po vsaki potezi ob
 * `preveri` iz pogona.
 *
 * Preverbe, ki so smiselne šele ob koncu, se izvedejo le, ko je žreb končan —
 * vmesna stanja ne smejo javljati lažnih napak, ker vmesnik ob napaki obred
 * ustavi.
 */
export function preveriLigaski(
  nastavitve: LigaNastavitve, ekipe: LigaEkipa[], nosilniVrstniRed: string[],
  stanje: ZrebStanje, koncano: boolean,
): string[] {
  const napake: string[] = []
  const ime = new Map(ekipe.map(e => [e.id, e.ime]))
  const n = (id: string) => ime.get(id) ?? id

  // 1. Zaporedna nosilca iz istega para sta v različnih skupinah.
  if (nastavitve.format === 'groups') {
    const red = nosilniVrstniRed.length ? nosilniVrstniRed : ekipe.map(e => e.id)
    const sk = stanje.dodeljene[PREDAL_SKUPINE] ?? {}
    for (let i = 0; i + 1 < red.length; i += 2) {
      const a = sk[red[i]], b = sk[red[i + 1]]
      if (a != null && b != null && a === b) {
        napake.push(`${n(red[i])} in ${n(red[i + 1])} sta zaporedna nosilca in ne smeta biti v isti skupini`)
      }
    }
    if (koncano) {
      for (const predal of [PREDAL_A, PREDAL_B]) {
        const st = Object.keys(stanje.dodeljene[predal] ?? {}).length
        if (st !== 6) napake.push(`Skupina ${predal === PREDAL_A ? 'A' : 'B'} ima ${st} ekip namesto 6`)
      }
    }
  }

  // 2. Ekipi s skupnim igriščem imata števili, ki tvorita veljaven par — TUDI
  //    kadar sta v različnih skupinah, ker skupini igrata ob istih terminih po
  //    isti tabeli in je ekipa s številko n v A domača v istih krogih kot ekipa
  //    s številko n v B.
  const velikost = nastavitve.format === 'groups' ? 6 : ekipe.length
  const veljavni = veljavniPariIgrisc(velikost, jeDvokrozno(nastavitve), nastavitve.berger_mirror)
  const dovoljene = new Set(veljavni.map(([a, b]) => `${a}-${b}`))

  /** Številka ekipe v njenem LASTNEM predalu (pri skupinah odvisno od skupine). */
  const stevilkaEkipe = (id: string): number | undefined => {
    if (nastavitve.format !== 'groups') return stanje.dodeljene[PREDAL_SKUPINE]?.[id]
    const skupina = stanje.dodeljene[PREDAL_SKUPINE]?.[id]
    if (skupina == null) return undefined
    return stanje.dodeljene[skupina === 1 ? PREDAL_A : PREDAL_B]?.[id]
  }

  for (const [a, b] of soigriscniPari(ekipe)) {
    const x = stevilkaEkipe(a), y = stevilkaEkipe(b)
    if (x == null || y == null) continue
    const kljuc = x < y ? `${x}-${y}` : `${y}-${x}`
    if (!dovoljene.has(kljuc)) {
      napake.push(`${n(a)} in ${n(b)} si delita igrišče, a številki ${x} in ${y} nista veljaven par`)
    }
  }
  return napake
}
