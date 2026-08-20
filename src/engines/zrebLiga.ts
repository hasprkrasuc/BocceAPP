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
 *
 * `nosilniVrstniRed` je OBVEZEN za format 'groups'. Brez njega (ali s
 * krnjenim seznamom) `ligaskiOpis` tiho pade nazaj na vrstni red ekip v bazi
 * (za pravo sezono abecedni), faza A pa razporedi napačne ali nepopolne pare
 * nosilcev — obred navidezno uspešno steče do konca, `jeKoncano` javi, da je
 * gotovo, in generični `preveri` ne vidi nič narobe. Za `flat` in `split` se
 * `nosilniVrstniRed` ne uporablja in ni preverjen.
 */
export function preveriIzvedljivost(
  ekipe: LigaEkipa[], nastavitve: LigaNastavitve, nosilniVrstniRed: string[] = [],
): string[] {
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
  if (nastavitve.format === 'groups') {
    // Nosilni vrstni red mora biti prava permutacija ekip sezone — sicer faza
    // A žreba skupin razporedi napačne ali manjkajoče ekipe, ne da bi to karkoli
    // po poti opazilo (glej dokumentacijski komentar funkcije).
    if (nosilniVrstniRed.length !== ekipe.length) {
      napake.push(
        `Nosilni vrstni red mora imeti vseh ${ekipe.length} ekip sezone, ima jih ${nosilniVrstniRed.length}. ` +
        `Pripravi razvrstitev za vse ekipe, preden začneš žreb.`,
      )
    }
    const steti = new Map<string, number>()
    for (const id of nosilniVrstniRed) steti.set(id, (steti.get(id) ?? 0) + 1)
    const podvojeni = [...steti.entries()].filter(([, k]) => k > 1).map(([id]) => id)
    if (podvojeni.length > 0) {
      napake.push(
        `Nosilni vrstni red vsebuje isto ekipo večkrat: ${podvojeni.join(', ')}. ` +
        `Vsaka ekipa sme biti v vrstnem redu samo enkrat.`,
      )
    }
    const idji = new Set(ekipe.map(e => e.id))
    const neznani = [...new Set(nosilniVrstniRed.filter(id => !idji.has(id)))]
    if (neznani.length > 0) {
      napake.push(
        `Nosilni vrstni red vsebuje ekipe, ki jih v tej sezoni ni: ${neznani.join(', ')}. ` +
        `Preveri, ali je razvrstitev pripravljena za pravo sezono.`,
      )
    }
    const vRedu = new Set(nosilniVrstniRed)
    const manjkajoci = ekipe.filter(e => !vRedu.has(e.id))
    if (manjkajoci.length > 0) {
      napake.push(
        `Nosilnemu vrstnemu redu manjkajo ekipe: ${manjkajoci.map(e => e.ime).join(', ')}. ` +
        `Dodaj jih v razvrstitev, preden začneš žreb.`,
      )
    }
  }
  if (nastavitve.format !== 'groups' && (ekipe.length < 3 || ekipe.length > 12)) {
    napake.push(`Bergerjev razpored zahteva 3 do 12 ekip (za 2 ekipi Bergerjeva tabela ne obstaja), sezona jih ima ${ekipe.length}.`)
  } else if (nastavitve.format !== 'groups') {
    // Izčrpno preveri, ali gre sploh razporediti vse soigriščne pare na
    // proste številke za to velikost lige in ta razpored — sicer bi obrazec
    // dovolil obred, ki se v precej primerih zagotovo zatakne sredi dvorane.
    const pari = soigriscniPari(ekipe)
    if (pari.length > 0) {
      const veljavni = veljavniPariIgrisc(ekipe.length, jeDvokrozno(nastavitve), nastavitve.berger_mirror)
      const vseStevilke = Array.from({ length: ekipe.length }, (_, i) => i + 1)
      if (!jeRazporeditevMozna(pari.length, vseStevilke, veljavni)) {
        napake.push(
          `${pari.length} ${pari.length === 1 ? 'par ekip si deli' : 'parov ekip si deli'} skupno igrišče, ` +
          `a pri ${ekipe.length} ekipah in tem razporedu ` +
          `(${jeDvokrozno(nastavitve) ? 'dvokrožno' : 'enokrožno'}${nastavitve.berger_mirror ? ', zrcaljeno' : ''}) ` +
          `jih ni mogoče vseh razporediti — žreb bi se zagotovo zataknil.`,
        )
      }
    }
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
 * Ali je mogoče preostale soigriščne pare še razporediti na proste številke.
 *
 * Iskanje s sestopanjem. Parov je največ šest in številk največ dvanajst, zato
 * je izčrpno iskanje trivialno — in edino, kar zares prepreči, da bi se žreb
 * zataknil. Pohlepna izbira partnerja brez tega preverjanja pri dveh ali več
 * parih zaide v slepo ulico v približno polovici primerov.
 */
export function jeRazporeditevMozna(
  steviloParov: number, proste: number[], veljavniPari: Array<[number, number]>,
): boolean {
  if (steviloParov === 0) return true
  const prosteMnozica = new Set(proste)
  for (const [a, b] of veljavniPari) {
    if (!prosteMnozica.has(a) || !prosteMnozica.has(b)) continue
    const ostanek = proste.filter(n => n !== a && n !== b)
    if (jeRazporeditevMozna(steviloParov - 1, ostanek, veljavniPari)) return true
  }
  return false
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

  /** Pari tega nabora, ki še čakajo na številko (prvi član še ni dodeljen). */
  const preostaliPari = (s: ZrebStanje) => {
    const ze = s.dodeljene[predal] ?? {}
    return mojiPari(s).filter(([a]) => !(a in ze))
  }

  const korakPari: Korak = {
    naziv: `${naziv} — ekipe s skupnim igriščem`,
    predal,
    udelezenci: prviIzParov,
    stevilke,
    veljavne: (s) => {
      const prosteArr = prosteV(s)
      // trenutni par se razreši s to potezo, zato ostane en par manj
      const preostaliK = preostaliPari(s).length - 1
      return prosteArr.filter(n => {
        const brezN = prosteArr.filter(x => x !== n)
        // veljavna je le številka, za katero obstaja prosta partnerska, PO
        // KATERI ODVZEMU pa je še vedno mogoče razporediti vse preostale pare —
        // ne le tista, ki je prosta ZDAJ (to je bila pohlepna napaka).
        return partnerskeStevilke(n, veljavniPari).some(p => {
          if (!brezN.includes(p)) return false
          const preostaleProste = brezN.filter(x => x !== p)
          return jeRazporeditevMozna(preostaliK, preostaleProste, veljavniPari)
        })
      })
    },
    posledice: (s, id, n) => {
      const par = mojiPari(s).find(([a]) => a === id)
      if (!par) return []
      const prosteArr = prosteV(s).filter(x => x !== n)
      const preostaliK = preostaliPari(s).length - 1
      const moznosti = partnerskeStevilke(n, veljavniPari).filter(p => prosteArr.includes(p))
      // izberi prvo partnersko številko, ki preostale pare pusti še izvedljive —
      // ne kar prvo prosto (`moznosti[0]`), ker lahko pohlepna izbira zaokroži
      // v slepo ulico za kak kasnejši par.
      const izbrana = moznosti.find(p => {
        const preostaleProste = prosteArr.filter(x => x !== p)
        return jeRazporeditevMozna(preostaliK, preostaleProste, veljavniPari)
      })
      if (izbrana === undefined) throw new Error(`za ${id} ni proste partnerske številke`)
      return [{
        udelezenecId: par[1],
        stevilka: izbrana,
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

/**
 * Skupinska liga.
 *
 * Faza A — za vsak par zaporednih nosilcev (1-2, 3-4, …) žreba samo PRVI, ali
 * gre v A (1) ali B (2). Drugi iz para gre samodejno v nasprotno skupino. Tako
 * sta zaporedna nosilca vedno ločena in sta skupini enakovredni.
 *
 * Faza B — številke 1..6 posebej v vsaki skupini. Najprej VSI soigriščni pari
 * obeh skupin, šele nato preostale ekipe: sicer lahko ekipe brez omejitve
 * zasedejo številke tako, da paru ne ostane veljavna razlika.
 */
function korakiSkupinskeLige(
  ekipe: LigaEkipa[], pari: Array<[string, string]>,
  nastavitve: LigaNastavitve, nosilniVrstniRed: string[],
): Korak[] {
  const red = nosilniVrstniRed.length ? nosilniVrstniRed : ekipe.map(e => e.id)
  const prviVParu = red.filter((_, i) => i % 2 === 0)
  const partner = new Map<string, string>()
  for (let i = 0; i + 1 < red.length; i += 2) partner.set(red[i], red[i + 1])

  const fazaA: Korak = {
    naziv: 'Razporeditev v skupini',
    predal: PREDAL_SKUPINE,
    // predal nosi OZNAKO skupine, ne edinstvenih številk: šest ekip dobi 1 in
    // šest 2, zato tu podvojitev ni napaka
    enolicne: false,
    udelezenci: () => prviVParu,
    stevilke: () => [1, 2],   // 1 = A, 2 = B
    veljavne: () => [1, 2],
    posledice: (_s, id, n) => {
      const drugi = partner.get(id)
      if (!drugi) return []
      return [{
        udelezenecId: drugi,
        stevilka: n === 1 ? 2 : 1,
        samodejno: true,
        razlog: 'sopostavljeni nosilec gre v nasprotno skupino',
      }]
    },
  }

  const clani = (oznaka: number) => (s: ZrebStanje) =>
    Object.entries(s.dodeljene[PREDAL_SKUPINE] ?? {})
      .filter(([, v]) => v === oznaka).map(([id]) => id)

  const skupinaOd = (s: ZrebStanje, id: string) => s.dodeljene[PREDAL_SKUPINE]?.[id]
  const predalOd = (s: ZrebStanje, id: string) => (skupinaOd(s, id) === 1 ? PREDAL_A : PREDAL_B)
  const veljavniPari6 = veljavniPariIgrisc(6, jeDvokrozno(nastavitve), nastavitve.berger_mirror)
  const proste = (s: ZrebStanje, predal: number) => {
    const vzete = new Set(Object.values(s.dodeljene[predal] ?? {}))
    return [1, 2, 3, 4, 5, 6].filter(n => !vzete.has(n))
  }

  /**
   * Soigriščni pari, ločeni po skupini PRVE ekipe iz para — korak ima en sam
   * predal, zato prva ekipa iz skupine A žreba iz nabora A, iz skupine B pa iz
   * nabora B. Partnerjeva številka gre v partnerjev predal, ki je lahko drug.
   */
  const korakPari = (oznaka: number, predal: number, imeSkupine: string): Korak => ({
    naziv: `Skupina ${imeSkupine} — ekipe s skupnim igriščem`,
    predal,
    udelezenci: (s) => pari.filter(([a]) => skupinaOd(s, a) === oznaka).map(([a]) => a),
    stevilke: () => [1, 2, 3, 4, 5, 6],
    veljavne: (s, id) => {
      const par = pari.find(([a]) => a === id)
      if (!par) return proste(s, predal)
      const partnerPredal = predalOd(s, par[1])
      const partnerjeveProste = new Set(proste(s, partnerPredal))
      return proste(s, predal).filter(n =>
        partnerskeStevilke(n, veljavniPari6).some(p =>
          partnerjeveProste.has(p) && !(partnerPredal === predal && p === n)))
    },
    posledice: (s, id, n) => {
      const par = pari.find(([a]) => a === id)
      if (!par) return []
      const partnerPredal = predalOd(s, par[1])
      const partnerjeveProste = new Set(proste(s, partnerPredal))
      if (partnerPredal === predal) partnerjeveProste.delete(n)
      const moznosti = partnerskeStevilke(n, veljavniPari6).filter(p => partnerjeveProste.has(p))
      if (moznosti.length === 0) throw new Error(`za ${id} ni proste partnerske številke`)
      return [{
        udelezenecId: par[1],
        stevilka: moznosti[0],
        samodejno: true,
        razlog: 'skupno rezervno igrišče',
        predal: partnerPredal,
      }]
    },
  })

  /** Ekipe skupine, ki niso v nobenem soigriščnem paru. */
  const korakOstali = (oznaka: number, predal: number, imeSkupine: string): Korak => ({
    naziv: `Skupina ${imeSkupine}`,
    predal,
    udelezenci: (s) => {
      const vParu = new Set(pari.flat())
      return clani(oznaka)(s).filter(id => !vParu.has(id))
    },
    stevilke: () => [1, 2, 3, 4, 5, 6],
    veljavne: (s) => proste(s, predal),
  })

  return [
    fazaA,
    korakPari(1, PREDAL_A, 'A'),
    korakPari(2, PREDAL_B, 'B'),
    korakOstali(1, PREDAL_A, 'A'),
    korakOstali(2, PREDAL_B, 'B'),
  ]
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
