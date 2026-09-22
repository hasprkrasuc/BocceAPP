/**
 * DRŽAVNA PRVENSTVA — katera izdaja šteje v rang lestvico.
 *
 * Rang lestvica gleda skozi 365-dnevno drseče okno. Okno samo po sebi ne loči
 * izdaj istega prvenstva: DP posamezno člani 2025 je bilo 28. 9. 2025, DP
 * posamezno 2026 pa je 13. 9. 2026 — petnajst dni bi igralec na lestvici nosil
 * točke OBEH izdaj, dokler stare ne poje okno.
 *
 * Pravilo: pri istem prvenstvu šteje samo NAJNOVEJŠA izdaja. Starejše odpadejo
 * takoj, ko ima novejša vpisane končne uvrstitve — ne šele čez leto dni.
 *
 * »Z vpisanimi izidi« ni podrobnost: prvenstvo je označeno kot končano že na
 * dan tekmovanja, grafikon s končnim vrstnim redom pa je vnesen kasneje. Če bi
 * nova izdaja prevzela mesto stare že ob oznaki, bi lestvica vmes ostala čisto
 * brez točk tega prvenstva.
 *
 * Isto prvenstvo = ista kategorija IN ista disciplina. MIX dvojice so svoja
 * kategorija (`mixed`), zato ne prevzamejo mesta članskim dvojicam.
 */

import { normalizirajDisciplino } from './tournamentPlacement'

/** Izdaja prvenstva, kolikor je je potrebno za izbor veljavnih. */
export interface DpIzdaja {
  /** Datum prvenstva (ISO, `YYYY-MM-DD`). */
  date: string
  category: string | null | undefined
  discipline_type: string | null | undefined
  /** Ali ima izdaja vpisano vsaj eno končno uvrstitev (`final_rank`). */
  imaIzide: boolean
}

/**
 * Ključ prvenstva — kategorija in disciplina skupaj.
 *
 * Disciplina gre skozi `normalizirajDisciplino`, ker je `discipline_type`
 * navaden `text` brez CHECK in ima ista disciplina v bazi več zapisov: DP igra
 * v krog je vpisano kot `igra v krog`, obrazec pa vpiše `krog`. Brez
 * poenotenja bi bili to dve različni prvenstvi in izdaja 2027 ne bi izrinila
 * izdaje 2026 — igralec bi na lestvici nosil točke obeh.
 *
 * Neprepoznan zapis obdrži samega sebe (le počiščenega), da se dve res
 * različni disciplini ne zlijeta v eno.
 */
export function kljucPrvenstva(p: DpIzdaja): string {
  const raw = p.discipline_type?.trim().toLowerCase() ?? ''
  const disciplina = normalizirajDisciplino(p.discipline_type) ?? raw
  return `${p.category ?? ''}|${disciplina}`
}

/**
 * Odstrani izdaje, ki jih je prehitela novejša izdaja istega prvenstva.
 *
 * Prehiti lahko le izdaja z vpisanimi izidi. Izdaje prvenstva, ki izidov še
 * nima nobena, ostanejo vse — v točke tako ali tako ne prispevajo nič.
 * Ob istem datumu (dvodnevno prvenstvo, vpisano dvakrat) obdržimo obe.
 */
export function veljavneIzdaje<T extends DpIzdaja>(izdaje: T[]): T[] {
  const najnovejsa = new Map<string, string>()
  for (const p of izdaje) {
    if (!p.imaIzide) continue
    const k = kljucPrvenstva(p)
    const doslej = najnovejsa.get(k)
    if (doslej === undefined || p.date > doslej) najnovejsa.set(k, p.date)
  }

  return izdaje.filter(p => {
    const meja = najnovejsa.get(kljucPrvenstva(p))
    return meja === undefined || p.date >= meja
  })
}
