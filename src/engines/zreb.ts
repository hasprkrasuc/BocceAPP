/**
 * SPLOŠEN POGON ŽREBA V ŽIVO
 *
 * Model: udeleženec izvleče številko, ta številka je njegovo mesto. Kaj mesto
 * pomeni (mesto v skupini, žrebana številka za Bergerja, mesto v mreži), ve
 * samo prilagojevalnik posameznega tekmovanja — ta modul tega ne ve.
 *
 * Modul je čista logika: brez DOM, brez baze in brez lastnega naključja
 * (generator se vbrizga, da so testi ponovljivi). Stanje je nespremenljivo in
 * serializabilno, zato je razveljavljanje odvzem s sklada, shranjevanje v
 * localStorage pa preprost JSON.
 */

export interface Udelezenec {
  id: string
  ime: string
  /** Neobvezna oznaka za prikaz (npr. klub ali nosilno mesto). */
  oznaka?: string
}

/** Ena dodelitev številke — bodisi izžrebana bodisi samodejna posledica. */
export interface Dodelitev {
  udelezenecId: string
  stevilka: number
  /** true = ni bila izžrebana, ampak izhaja iz pravila. */
  samodejno: boolean
  /** Razlog samodejne dodelitve; izpiše se občinstvu. */
  razlog?: string
}

/**
 * Ena faza obreda. `predal` pove, kam se dodelitve shranijo — koraki z istim
 * predalom si delijo nabor številk (npr. soigriščni pari in preostale ekipe
 * iste skupine), koraki z različnimi predali pa ne (skupina A in skupina B
 * obe uporabljata številke 1..6).
 */
export interface Korak {
  naziv: string
  predal: number
  /**
   * Ali morajo biti številke tega predala med seboj različne. Privzeto true.
   *
   * Žreb skupin dodeljuje OZNAKO (1 = A, 2 = B), ki jo dobi več udeležencev —
   * tam podvojitev ni napaka, ampak bistvo. Tak korak nastavi false.
   */
  enolicne?: boolean
  /** Udeleženci tega koraka; funkcija, ker so lahko odvisni od prejšnjih korakov. */
  udelezenci(stanje: ZrebStanje): string[]
  /** Vse številke tega predala. */
  stevilke(stanje: ZrebStanje): number[]
  /** Katere številke sme dobiti ta udeleženec zdaj. */
  veljavne(stanje: ZrebStanje, udelezenecId: string): number[]
  /** Dodatne dodelitve, ki jih ta poteg sproži (sopostavljeni nosilec, soigriščna ekipa). */
  posledice?(stanje: ZrebStanje, udelezenecId: string, stevilka: number): Dodelitev[]
}

export interface ZrebOpis {
  udelezenci: Udelezenec[]
  koraki: Korak[]
}

export interface DnevnikVnos {
  tip: 'udelezenec' | 'stevilka'
  udelezenecId: string
  stevilka?: number
  samodejno?: boolean
  razlog?: string
  korak: number
}

export interface ZrebStanje {
  /** predal → (udeleženec → številka) */
  dodeljene: Record<number, Record<string, number>>
  korak: number
  /** Udeleženec, ki je izvlečen, a še nima številke. */
  cakajoca: string | null
  dnevnik: DnevnikVnos[]
}

/**
 * Nespremenljivo začetno stanje.
 *
 * Stanje se takoj normalizira na prvi korak, ki sploh ima kandidate. Brez tega
 * bi prazen vodilni korak — na primer korak soigriščnih parov v ligi, ki si
 * nobenih igrišč ne deli — obred ustavil, še preden bi se izvlekla prva
 * številka, ker `kandidati` gleda samo trenutni korak in ne išče naprej.
 */
export function zacniZreb(opis: ZrebOpis): ZrebStanje {
  return napreduj(opis, { dodeljene: {}, korak: 0, cakajoca: null, dnevnik: [] })
}

/** Številka, dodeljena udeležencu v danem predalu (ali undefined). */
export function dodeljena(stanje: ZrebStanje, predal: number, id: string): number | undefined {
  return stanje.dodeljene[predal]?.[id]
}

/** Preostale številke trenutnega (ali podanega) koraka. */
export function preostale(opis: ZrebOpis, stanje: ZrebStanje, korakIdx = stanje.korak): number[] {
  const korak = opis.koraki[korakIdx]
  if (!korak) return []
  const vzete = new Set(Object.values(stanje.dodeljene[korak.predal] ?? {}))
  return korak.stevilke(stanje).filter(n => !vzete.has(n))
}

/** Udeleženci, ki so lahko na vrsti zdaj. */
export function kandidati(opis: ZrebOpis, stanje: ZrebStanje): string[] {
  if (stanje.cakajoca) return [stanje.cakajoca]
  const korak = opis.koraki[stanje.korak]
  if (!korak) return []
  const ze = stanje.dodeljene[korak.predal] ?? {}
  return korak.udelezenci(stanje).filter(id => !(id in ze))
}

/** Ali so vsi udeleženci vseh korakov dobili številko. */
export function jeKoncano(opis: ZrebOpis, stanje: ZrebStanje): boolean {
  if (stanje.cakajoca) return false
  return opis.koraki.every(k => {
    const ze = stanje.dodeljene[k.predal] ?? {}
    return k.udelezenci(stanje).every(id => id in ze)
  })
}

/** Preskoči korake, ki nimajo več kandidatov. */
function napreduj(opis: ZrebOpis, stanje: ZrebStanje): ZrebStanje {
  let korak = stanje.korak
  while (korak < opis.koraki.length) {
    const k = opis.koraki[korak]
    const ze = stanje.dodeljene[k.predal] ?? {}
    if (k.udelezenci(stanje).some(id => !(id in ze))) break
    korak++
  }
  return korak === stanje.korak ? stanje : { ...stanje, korak }
}

/** Izvleče naslednjega udeleženca. Vrne NOVO stanje. */
export function izvleciUdelezenca(
  opis: ZrebOpis, stanje: ZrebStanje, randInt: (n: number) => number,
): ZrebStanje {
  if (stanje.cakajoca) throw new Error('udeleženec je že izvlečen — najprej izvleci številko')
  const k = kandidati(opis, stanje)
  if (k.length === 0) throw new Error('ni več udeležencev za žrebanje')
  const id = k[randInt(k.length)]
  return {
    ...stanje,
    cakajoca: id,
    dnevnik: [...stanje.dnevnik, { tip: 'udelezenec', udelezenecId: id, korak: stanje.korak }],
  }
}

/** Izvleče številko za čakajočega udeleženca in uveljavi posledice. Vrne NOVO stanje. */
export function izvleciStevilko(
  opis: ZrebOpis, stanje: ZrebStanje, randInt: (n: number) => number,
): ZrebStanje {
  const id = stanje.cakajoca
  if (!id) throw new Error('najprej izvleci udeleženca')
  const korak = opis.koraki[stanje.korak]
  const veljavne = korak.veljavne(stanje, id)
  if (veljavne.length === 0) {
    throw new Error(`za ${id} ni nobene veljavne številke — žreb se ne more nadaljevati`)
  }
  const stevilka = veljavne[randInt(veljavne.length)]

  const vse: Dodelitev[] = [
    { udelezenecId: id, stevilka, samodejno: false },
    ...(korak.posledice?.(stanje, id, stevilka) ?? []),
  ]

  const predal = { ...(stanje.dodeljene[korak.predal] ?? {}) }
  const dnevnik = [...stanje.dnevnik]
  for (const d of vse) {
    if (d.udelezenecId in predal) {
      throw new Error(`${d.udelezenecId} ima številko že dodeljeno`)
    }
    predal[d.udelezenecId] = d.stevilka
    dnevnik.push({
      tip: 'stevilka', udelezenecId: d.udelezenecId, stevilka: d.stevilka,
      samodejno: d.samodejno, razlog: d.razlog, korak: stanje.korak,
    })
  }

  const naslednje: ZrebStanje = {
    ...stanje,
    dodeljene: { ...stanje.dodeljene, [korak.predal]: predal },
    cakajoca: null,
    dnevnik,
  }
  return napreduj(opis, naslednje)
}

/**
 * Vrne seznam kršenih invariant v slovenščini; prazen seznam pomeni, da je vse
 * v redu. Preverbe, ki so smiselne šele ob koncu, se izvedejo le, ko je žreb
 * končan — vmesna stanja ne smejo javljati lažnih napak, ker vmesnik ob napaki
 * obred ustavi.
 */
export function preveri(opis: ZrebOpis, stanje: ZrebStanje): string[] {
  const napake: string[] = []
  const imena = new Map(opis.udelezenci.map(u => [u.id, u.ime]))
  const ime = (id: string) => imena.get(id) ?? id

  // Predali, v katerih je podvajanje številk pričakovano (npr. žreb skupin:
  // predal je OZNAKA skupine, ki jo dobi več udeležencev). Izračunano vnaprej,
  // da se koraki, ki si delijo predal, obnašajo dosledno — dovolj je, da
  // katerikoli od njih predal označi za ne-enoličnega.
  const neEnolicniPredali = new Set(
    opis.koraki.filter(k => k.enolicne === false).map(k => k.predal),
  )
  const preverjeniPredali = new Set<number>()

  for (const korak of opis.koraki) {
    const ze = stanje.dodeljene[korak.predal] ?? {}
    const nabor = new Set(korak.stevilke(stanje))
    for (const [id, st] of Object.entries(ze)) {
      if (!nabor.has(st)) napake.push(`${ime(id)}: številka ${st} ni v naboru koraka „${korak.naziv}“`)
    }
    // Podvojenost preverimo kvečjemu enkrat na predal, sicer bi jo koraki, ki
    // si delijo predal, javili vsak zase — enkrat prijavljeno je dovolj.
    if (!neEnolicniPredali.has(korak.predal) && !preverjeniPredali.has(korak.predal)) {
      preverjeniPredali.add(korak.predal)
      const videne = new Map<number, string>()
      for (const [id, st] of Object.entries(ze)) {
        const prej = videne.get(st)
        if (prej) napake.push(`podvojena številka ${st} v koraku „${korak.naziv}“: ${ime(prej)} in ${ime(id)}`)
        else videne.set(st, id)
      }
    }
  }

  if (jeKoncano(opis, stanje)) {
    for (const korak of opis.koraki) {
      const ze = stanje.dodeljene[korak.predal] ?? {}
      for (const id of korak.udelezenci(stanje)) {
        if (!(id in ze)) napake.push(`${ime(id)} nima številke v koraku „${korak.naziv}“`)
      }
    }
  }
  return [...new Set(napake)]
}
