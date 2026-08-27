/**
 * ISKANJE PODVOJENIH ZAPISOV ISTE OSEBE
 *
 * Dvojnike je doslej odkrival človek, ko je nanje po naključju naletel —
 * Mohinski, Vehovec, Šumi in Brus so bili najdeni tako. Ta motor jih poišče
 * sam in jih ponudi v presojo; združi jih še vedno človek, prek
 * zdruzitevUporabnikov.ts.
 *
 * KAJ SE JE POKAZALO NA PRAVIH PODATKIH (26. 8. 2026, 1448 zapisov)
 *
 * Ujemanje imena je samo po sebi ŠIBEK signal. Osem parov se ujema po imenu,
 * a jih je šest različnih ljudi:
 *
 *   Ivan Ličan 1964 : Ivan Ličan 1961          — isti klub, dva človeka
 *   IGOR TURK 1992 : IGOR TURK 1975            — isti klub, dva človeka
 *   Anton Anže TROBEC 2010 : Anton TROBEC 1977 — oče in sin
 *
 * Zato ime določa le, KDO pride v poštev. Odloča razločevalec:
 *
 *   - Kdor ima svoj EMŠO, je svoja oseba. Delni unikat users_emso_uniq
 *     poskrbi, da dva zapisa nikoli ne moreta imeti istega, torej dva
 *     neprazna EMŠO vedno pomenita dve različni številki — in dve osebi.
 *   - Različna letnica rojstva pove isto.
 *   - Nasprotno pa je PRAZEN zapis (brez EMŠO, datuma rojstva in licence)
 *     podpis uvoznega dvojnika: uvoz ga ustvari prav zato, ker ga ni imel po
 *     čem ujeti.
 *
 * ZAKAJ NE UJEMANJE PO LICENCI
 *
 * Številka licence ni enolična. V bazi so 'U14' (10 zapisov), 'U18', prazen
 * niz, kratke številke pa se ponavljajo med klubi — '110' nosita člana dveh
 * različnih društev. Kot signal odpade.
 *
 * ZAKAJ NE UJEMANJE PO KLUBU
 *
 * Bi mikalo, a oba zgornja protiprimera (Ličan, Turk) sta v ISTEM klubu.
 * Klub torej ne loči ničesar; prikaže se človeku, v oceno pa ne šteje.
 */

import { normalizeName } from '../lib/playerImport/matchPlayers'

export interface ZapisZaPrimerjavo {
  id: string
  full_name: string | null
  emso?: string | null
  date_of_birth?: string | null
  license_number?: string | null
  birth_year?: number | null
  club?: string | null
  club_id?: string | null
}

/**
 * - `verjeten`     ime se ujema in ena stran je prazna — podpis uvoznega dvojnika
 * - `mozen`        ime se ujema, razločevalca ni ne za ne proti
 * - `malo_verjeten` ime se ujema, a razločevalec govori proti
 */
export type Zanesljivost = 'verjeten' | 'mozen' | 'malo_verjeten'

export type VrstaUjemanja = 'isti_nabor' | 'podmnozica'

export interface Par<T extends ZapisZaPrimerjavo> {
  a: T
  b: T
  zanesljivost: Zanesljivost
  ujemanje: VrstaUjemanja
  /** Kaj govori za združitev. */
  za: string[]
  /** Kaj govori proti — prikaže se človeku pred odločitvijo. */
  proti: string[]
  /** Človek je že potrdil, da NISTA ista oseba (tabela preverjeni_dvojniki). */
  preverjen: boolean
}

/**
 * Enolični ključ para, neodvisen od vrstnega reda.
 *
 * Isti vrstni red mora veljati tudi v bazi — omejitev `id_a < id_b` v tabeli
 * preverjeni_dvojniki. Brez tega bi par lahko obstajal dvakrat, enkrat v vsaki
 * smeri, in bi ga utišanje v eni pustilo vidnega v drugi.
 */
export const kljucPara = (a: string, b: string): string =>
  a < b ? `${a}:${b}` : `${b}:${a}`

const VRSTNI_RED: Record<Zanesljivost, number> = {
  verjeten: 0, mozen: 1, malo_verjeten: 2,
}

/**
 * Besede imena, brez ločil in diakritike; podvojene odpadejo.
 *
 * Števke se OHRANIJO. Prvotno sem jih brisal skupaj z ločili, kar je bilo
 * napačno: »Ime1 Priimek1« in »Ime2 Priimek2« sta se skrčila na isti par besed
 * in postala dvojnika. V pravih imenih števk ni, a kadar se pojavijo, so edino,
 * kar zapisa loči — brisati jih pomeni zliti dva različna človeka.
 */
export function zetoni(ime: string | null | undefined): string[] {
  const brez = normalizeName(ime ?? '').replace(/[^a-z0-9 ]+/g, ' ')
  return [...new Set(brez.split(' ').filter(Boolean))]
}

const prazno = (v: unknown): boolean => v === null || v === undefined || v === ''

/** Zapis brez EMŠO, datuma rojstva in licence — takega ustvari uvoz, ko nima česa ujeti. */
export function jePrazenZapis(z: ZapisZaPrimerjavo): boolean {
  return prazno(z.emso) && prazno(z.date_of_birth) && prazno(z.license_number)
}

const jePodmnozica = (manjsi: string[], vecji: Set<string>): boolean =>
  manjsi.every(t => vecji.has(t))

/**
 * Presodi en par, ki se že ujema po imenu.
 *
 * Razločevalec šteje samo, kadar ga imata OBA. Zapis brez EMŠO ne dokazuje
 * ničesar — prav to je najpogostejše stanje in prav zato dvojniki nastajajo.
 */
export function presodiPar<T extends ZapisZaPrimerjavo>(
  a: T, b: T, ujemanje: VrstaUjemanja, preverjen = false,
): Par<T> {
  const za: string[] = []
  const proti: string[] = []

  za.push(ujemanje === 'isti_nabor' ? 'ime se ujema' : 'ime enega je vsebovano v drugem')

  if (!prazno(a.emso) && !prazno(b.emso)) {
    proti.push(`vsak ima svoj EMŠO (${a.emso} in ${b.emso}) — to sta praviloma dve osebi`)
  }
  if (a.birth_year != null && b.birth_year != null && a.birth_year !== b.birth_year) {
    proti.push(`različna letnica rojstva (${a.birth_year} in ${b.birth_year})`)
  }

  const aPrazen = jePrazenZapis(a)
  const bPrazen = jePrazenZapis(b)
  if (aPrazen !== bPrazen) {
    za.push('en zapis je brez EMŠO, datuma rojstva in licence — tak nastane ob uvozu, ki osebe ni imel po čem ujeti')
  }

  if (a.birth_year != null && b.birth_year != null && a.birth_year === b.birth_year) {
    za.push(`ista letnica rojstva (${a.birth_year})`)
  }

  const zanesljivost: Zanesljivost =
    proti.length > 0 ? 'malo_verjeten'
    : aPrazen !== bPrazen ? 'verjeten'
    : 'mozen'

  return { a, b, zanesljivost, ujemanje, za, proti, preverjen }
}

/**
 * Poišče vse pare, ki se ujemajo po imenu.
 *
 * Vsakega para ne primerjamo z vsakim: pri 1448 zapisih bi bilo to milijon
 * primerjav ob vsakem odprtju zaslona. Namesto tega zapise zložimo v predale
 * po besedah imena in vsak zapis primerjamo le s tistimi iz predala njegove
 * NAJREDKEJŠE besede. To ne izpusti ničesar: če je nabor A podmnožica nabora
 * B, so vse besede A tudi v B, torej tudi najredkejša — in B je v tistem
 * predalu.
 *
 * Zapisi z eno samo besedo imena (ali brez) so izpuščeni: »Skala« bi se ujela
 * z vsako »Skala Hrast«, kar ni ujemanje osebe, ampak šum.
 */
export function poisciDvojnike<T extends ZapisZaPrimerjavo>(
  zapisi: T[],
  /** Ključi parov, za katere je človek že potrdil, da nista ista oseba. */
  preverjeni: ReadonlySet<string> = new Set(),
): Par<T>[] {
  const pripravljeni = zapisi
    .map(z => ({ z, t: zetoni(z.full_name) }))
    .filter(x => x.t.length >= 2)

  const predali = new Map<string, number[]>()
  pripravljeni.forEach((x, i) => {
    for (const t of x.t) {
      const p = predali.get(t)
      if (p) p.push(i)
      else predali.set(t, [i])
    }
  })

  const pari: Par<T>[] = []
  const videni = new Set<string>()

  pripravljeni.forEach((x, i) => {
    const najredkejsa = x.t.reduce((naj, t) =>
      (predali.get(t)?.length ?? 0) < (predali.get(naj)?.length ?? 0) ? t : naj, x.t[0])

    for (const j of predali.get(najredkejsa) ?? []) {
      if (i === j) continue
      const y = pripravljeni[j]
      const kljuc = i < j ? `${i}:${j}` : `${j}:${i}`
      if (videni.has(kljuc)) continue

      const setX = new Set(x.t)
      const setY = new Set(y.t)
      const xVY = jePodmnozica(x.t, setY)
      const yVX = jePodmnozica(y.t, setX)
      if (!xVY && !yVX) continue

      videni.add(kljuc)
      // Vrstni red v paru: prazni zapis gre na drugo mesto, ker je predlog
      // vedno »obdrži polnega«.
      const [prvi, drugi] = jePrazenZapis(x.z) && !jePrazenZapis(y.z) ? [y.z, x.z] : [x.z, y.z]
      pari.push(presodiPar(
        prvi, drugi,
        xVY && yVX ? 'isti_nabor' : 'podmnozica',
        preverjeni.has(kljucPara(prvi.id, drugi.id)),
      ))
    }
  })

  // Preverjeni gredo na dno ne glede na zanesljivost: nekdo jih je že pogledal.
  return pari.sort((p, q) =>
    Number(p.preverjen) - Number(q.preverjen) ||
    VRSTNI_RED[p.zanesljivost] - VRSTNI_RED[q.zanesljivost] ||
    (p.a.full_name ?? '').localeCompare(q.a.full_name ?? '', 'sl'))
}
