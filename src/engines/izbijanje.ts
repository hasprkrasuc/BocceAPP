/**
 * IZBIJANJE — hitrostno, natančno in štafetno.
 *
 * Te discipline niso dvoboji: vsak tekmovalec izbija sam in dobi ŠTEVILO
 * zadetkov. Zato tu ni pajka ne skupin — so SERIJE, po vsaki pa gre naprej
 * najboljših nekaj.
 *
 * Koliko serij je, pove število prijavljenih (pravilo BZS):
 *
 *   do 6      — ena sama serija in ta da končni vrstni red
 *   7 do 15   — kvalifikacije, štirje najboljši v finale
 *   16 in več — kvalifikacije, osem v četrtfinale, štirje v finale
 *
 * KONČNI VRSTNI RED se bere od zadaj: kdor je prišel dlje, je pred tistim, ki
 * ni. Finalisti zasedejo mesta 1–4 po finalnem izidu, četrtfinalisti brez
 * finala 5–8 po četrtfinalnem, ostali od 9 naprej po kvalifikacijskem. Tako je
 * razvrščen tudi priloženi grafikon DP 2025 (DP natančno člani: Korošec zmaga
 * s 27 v finalu, čeprav je imel v kvalifikacijah 11 — finale prejšnjih serij
 * NE sešteva, ampak jih nadomesti).
 *
 * IZENAČENJE. Znotraj kroga odloči izid tega kroga; ob istem izidu prejšnji
 * krog in nazadnje žrebana številka.
 *
 * DODATNO IZBIJANJE je SVOJ izid in NE popravek rednega. Kadar sta izenačena
 * osmi in deveti, dodatno izbijanje odloči le, kateri od njiju gre naprej —
 * dvigniti ju ne more nad tiste, ki so v redni seriji dosegli več. Zato se
 * vpisuje v svoje polje (`dodatno`) in nikoli v izid serije: če bi popravek
 * pisali v redno polje, bi se izenačenima rezultat povečal in bi preskočila
 * tekmovalce pred sabo.
 *
 * Dodatno izbijanje je potrebno na dveh mestih:
 *   - na MEJI NAPREDOVANJA (kdo gre v četrtfinale oziroma finale),
 *   - v ZADNJI SERIJI, kjer izenačenje pomeni deljeno mesto na stopničkah.
 * Kje je potrebno, pove `izenacenjaZaRazresiti()`.
 */

/** Serije, kolikor jih tekmovanje sploh pozna. */
export type KrogIzbijanja = 'kvalifikacije' | 'cetrtfinale' | 'finale'

/** Zaporedje krogov od prvega do finala, po vrsti. */
export const VRSTNI_RED_KROGOV: readonly KrogIzbijanja[] = ['kvalifikacije', 'cetrtfinale', 'finale']

export const IME_KROGA: Record<KrogIzbijanja, string> = {
  kvalifikacije: 'Kvalifikacije',
  cetrtfinale: 'Četrtfinale',
  finale: 'Finale',
}

export interface Sistem {
  /** Krogi, ki se odigrajo, po vrsti. */
  krogi: KrogIzbijanja[]
  /** `napreduje[i]` = koliko tekmovalcev gre iz `krogi[i]` v `krogi[i+1]`. */
  napreduje: number[]
}

/** Meji med sistemi — šestica še spada k eni sami seriji. */
export const MEJA_ENA_SERIJA = 6
export const MEJA_CETRTFINALE = 16

/**
 * Sistem tekmovanja glede na število prijavljenih.
 *
 * Zgornje meje ni: pravilo govori o 16 do 32, a tekmovanje s 33 prijavljenimi
 * ne sme ostati brez sistema — od 16 naprej velja isti trojni sistem.
 */
export function sistemIzbijanja(stTekmovalcev: number): Sistem {
  if (!Number.isInteger(stTekmovalcev) || stTekmovalcev < 1) {
    throw new Error(`Število tekmovalcev mora biti pozitivno celo število, dobil ${stTekmovalcev}`)
  }
  if (stTekmovalcev <= MEJA_ENA_SERIJA) return { krogi: ['finale'], napreduje: [] }
  if (stTekmovalcev < MEJA_CETRTFINALE) {
    return { krogi: ['kvalifikacije', 'finale'], napreduje: [4] }
  }
  return { krogi: ['kvalifikacije', 'cetrtfinale', 'finale'], napreduje: [8, 4] }
}

/** Nastop enega tekmovalca: žrebana številka in izidi po krogih. */
export interface Nastop {
  /** Id prijave (`tournament_registrations.id`). */
  id: string
  /** Žrebana številka — zadnje merilo pri izenačenju. */
  stZreba: number
  /** Izid posameznega kroga; manjka ali null = v tem krogu ni nastopil. */
  izidi: Partial<Record<KrogIzbijanja, number | null>>
  /**
   * Izid DODATNEGA izbijanja v posameznem krogu — vpisan samo pri izenačenih.
   * Loči jih med sabo, na uvrstitev proti ostalim pa ne vpliva.
   */
  dodatno?: Partial<Record<KrogIzbijanja, number | null>>
}

const izid = (n: Nastop, k: KrogIzbijanja): number | null => n.izidi[k] ?? null
const dodatno = (n: Nastop, k: KrogIzbijanja): number | null => n.dodatno?.[k] ?? null

/** Ali je tekmovalec v tem krogu nastopil (ima vpisan izid). */
export function jeNastopil(n: Nastop, k: KrogIzbijanja): boolean {
  return izid(n, k) !== null
}

/**
 * Primerjava dveh nastopov v danem krogu.
 *
 * Najprej izid serije, ob izenačenju DODATNO izbijanje te serije (kadar sta ga
 * oba opravila), nato isto za prejšnje serije in nazadnje nižja žrebana
 * številka. Dodatno izbijanje torej loči le tista dva, ki sta bila izenačena —
 * na razmerje do ostalih ne more vplivati, ker se primerja šele po tem, ko sta
 * redna izida že enaka.
 */
function primerjaj(a: Nastop, b: Nastop, krog: KrogIzbijanja, sistem: Sistem): number {
  const doKroga = sistem.krogi.slice(0, sistem.krogi.indexOf(krog) + 1).reverse()
  for (const k of doKroga) {
    const ia = izid(a, k), ib = izid(b, k)
    if (ia !== ib) {
      if (ia === null) return 1
      if (ib === null) return -1
      return ib - ia
    }
    const da = dodatno(a, k), db = dodatno(b, k)
    if (da !== null && db !== null && da !== db) return db - da
  }
  return a.stZreba - b.stZreba
}

/** Ali je skupina izenačenih med sabo razrešena z dodatnim izbijanjem. */
function razreseno(skupina: Nastop[], krog: KrogIzbijanja): boolean {
  const vrednosti = skupina.map(n => dodatno(n, krog))
  if (vrednosti.some(v => v === null)) return false
  return new Set(vrednosti).size === vrednosti.length
}

export interface Napredovanje {
  /** Id-ji, ki gredo v naslednji krog. */
  napreduje: string[]
  /**
   * Id-ji, ki jih izid tega kroga izenačuje ČEZ mejo napredovanja — eni bi
   * šli naprej, drugi ne. Vrstni red v `napreduje` je zanje le začasen,
   * dokler ne opravijo dodatnega izbijanja. Ko ga imajo vpisanega in so izidi
   * različni, je seznam prazen.
   */
  izenaceni: string[]
}

/**
 * Kdo gre iz tega kroga naprej.
 *
 * Šteje samo, kdor je v krogu nastopil — prijavljen, a neprisoten tekmovalec
 * ne more zasesti mesta v finalu.
 */
export function napredovali(
  nastopi: Nastop[],
  krog: KrogIzbijanja,
  koliko: number,
  sistem: Sistem,
): Napredovanje {
  const nastopili = nastopi.filter(n => jeNastopil(n, krog))
  const urejeni = [...nastopili].sort((a, b) => primerjaj(a, b, krog, sistem))
  const napreduje = urejeni.slice(0, koliko).map(n => n.id)

  // Izenačenje čez mejo: zadnji, ki gre naprej, in prvi, ki ne, imata isti izid.
  let izenaceni: string[] = []
  if (urejeni.length > koliko && koliko > 0) {
    const mejni = izid(urejeni[koliko - 1], krog)
    if (mejni !== null && izid(urejeni[koliko], krog) === mejni) {
      const skupina = urejeni.filter(n => izid(n, krog) === mejni)
      if (!razreseno(skupina, krog)) izenaceni = skupina.map(n => n.id)
    }
  }
  return { napreduje, izenaceni }
}

/** Skupina, ki mora opraviti dodatno izbijanje, in razlog. */
export interface ZaRazresiti {
  krog: KrogIzbijanja
  ids: string[]
  /** 'napredovanje' = odloča, kdo gre naprej; 'uvrstitev' = odloča mesto na koncu. */
  razlog: 'napredovanje' | 'uvrstitev'
}

/**
 * Kje je dodatno izbijanje potrebno.
 *
 * Dve mesti: meja napredovanja v vsakem krogu, ki ima naslednjega, in
 * izenačenje v ZADNJI seriji, kjer se deli mesto na lestvici (1.–4. mesto
 * prinaša različne točke, zato deljeno mesto ni sprejemljivo).
 *
 * Izenačenja niže v izpadlih skupinah ne zahtevajo dodatnega izbijanja —
 * tam mesto odloči prejšnja serija in nazadnje žrebana številka, tako kot na
 * grafikonu DP 2025.
 */
export function izenacenjaZaRazresiti(nastopi: Nastop[], sistem: Sistem): ZaRazresiti[] {
  const out: ZaRazresiti[] = []

  sistem.krogi.forEach((krog, i) => {
    if (i + 1 >= sistem.krogi.length) return
    const { izenaceni } = napredovali(nastopi, krog, sistem.napreduje[i], sistem)
    if (izenaceni.length) out.push({ krog, ids: izenaceni, razlog: 'napredovanje' })
  })

  // Zadnja serija: vsako izenačenje pomeni deljeno končno mesto.
  const zadnji = sistem.krogi[sistem.krogi.length - 1]
  const vZadnji = nastopi.filter(n => jeNastopil(n, zadnji))
  const poIzidu = new Map<number, Nastop[]>()
  for (const n of vZadnji) {
    const v = izid(n, zadnji)!
    poIzidu.set(v, [...(poIzidu.get(v) ?? []), n])
  }
  for (const skupina of poIzidu.values()) {
    if (skupina.length > 1 && !razreseno(skupina, zadnji)) {
      out.push({ krog: zadnji, ids: skupina.map(n => n.id), razlog: 'uvrstitev' })
    }
  }
  return out
}

export interface Uvrstitev {
  id: string
  /** Končno mesto, od 1 naprej. */
  mesto: number
  /** Najdlji krog, ki ga je tekmovalec odigral. */
  zadnjiKrog: KrogIzbijanja | null
  /** Izid v tem krogu; null, kadar tekmovalec ni nastopil nikjer. */
  izid: number | null
}

/**
 * Končni vrstni red celotnega tekmovanja.
 *
 * Tekmovalci so razdeljeni po najdaljšem doseženem krogu (finale pred
 * četrtfinalom pred kvalifikacijami), znotraj skupine pa razvrščeni po izidu
 * tega kroga. Kdor ni nastopil nikjer, pade na konec.
 */
export function koncniVrstniRed(nastopi: Nastop[], sistem: Sistem): Uvrstitev[] {
  const odZadaj = [...sistem.krogi].reverse()

  const zadnji = (n: Nastop): KrogIzbijanja | null =>
    odZadaj.find(k => jeNastopil(n, k)) ?? null

  const skupine = odZadaj.map(krog => ({
    krog,
    clani: nastopi.filter(n => zadnji(n) === krog).sort((a, b) => primerjaj(a, b, krog, sistem)),
  }))
  const brezNastopa = nastopi
    .filter(n => zadnji(n) === null)
    .sort((a, b) => a.stZreba - b.stZreba)

  const out: Uvrstitev[] = []
  for (const { krog, clani } of skupine) {
    for (const n of clani) {
      out.push({ id: n.id, mesto: out.length + 1, zadnjiKrog: krog, izid: izid(n, krog) })
    }
  }
  for (const n of brezNastopa) {
    out.push({ id: n.id, mesto: out.length + 1, zadnjiKrog: null, izid: null })
  }
  return out
}
