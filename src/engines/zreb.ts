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

/** Nespremenljivo začetno stanje. */
export function zacniZreb(_opis: ZrebOpis): ZrebStanje {
  return { dodeljene: {}, korak: 0, cakajoca: null, dnevnik: [] }
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
