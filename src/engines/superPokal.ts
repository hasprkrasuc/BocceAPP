import type { MatchStage } from '../types'

/**
 * SUPER POKAL — ena tekma na leto.
 *
 * PRAVILO (BZS): igrata aktualni POKALNI PRVAK in aktualni PRVAK SUPER LIGE.
 * Če je to ista ekipa, njeno mesto prevzame POKALNI PODPRVAK. Tekma se VEDNO
 * igra pri pokalnem prvaku.
 *
 * Super Pokal 2026 je prav ta izjema: QAP Postojna je osvojila Pokal BZS
 * 2025/26 in Super ligo 2025/26, zato igra proti pokalnemu podprvaku Skala
 * Sežana, doma.
 *
 * ZAKAJ SVOJE PRAVILO O DOMAČINU
 *
 * V navadnem pokalu gosti NIŽJE rangirana ekipa (`pokalniDomacin` v
 * engines/pokal.ts). Tu je pravilo drugačno in močnejše: domačin je pokalni
 * prvak, pa če je nasprotnik iz katerekoli lige. Letos bi `pokalniDomacin`
 * dal isti izid po naključju — ranga sta izenačena, oba kluba sta v Super
 * ligi, zato obdrži vrstni red para in mesto 1 ostane doma. Pravilo pa
 * odpove, brž ko je izzivalec iz nižje lige: takrat `pokalniDomacin` strani
 * OBRNE in gostil bi izzivalec. Zato svoja funkcija in svoj test.
 *
 * MESTO V PAJKU JE VLOGA. Ekipa z `draw_number` 1 je pokalni prvak in
 * domačin, ekipa z 2 je nasprotnik. Žreba ni — vlogi določi lanska sezona,
 * vpiše pa ju človek, ker aplikacija »aktualne« sezone ne zna zanesljivo
 * prepoznati (glej `superPokalUdelezenca`).
 */

/** Mesto pokalnega prvaka in domačina. */
export const MESTO_PRVAKA = 1
/** Mesto nasprotnika. */
export const MESTO_NASPROTNIKA = 2

/** Udeleženec, kakor ga vrne izbor. */
export interface SuperPokalUdelezenec {
  teamId: string
  /** Od kod pravica do nastopa. */
  vloga: 'pokalni_prvak' | 'prvak_super_lige' | 'pokalni_podprvak'
}

export interface SuperPokalPar {
  /** Pokalni prvak — vedno domačin. */
  domacin: SuperPokalUdelezenec
  gost: SuperPokalUdelezenec
  /** Ali se je sprožila izjema (isti klub je osvojil oboje). */
  istiPrvak: boolean
}

/**
 * Udeleženca Super Pokala iz lanskih prvakov.
 *
 * `pokalniVrstniRed` so ekipe lanskega pokala po uvrstitvi: prva je prvak,
 * druga podprvak. `prvakSuperLige` je zmagovalec lanske Super lige.
 *
 * Primerjamo po KLUBU in ne po id ekipe: ekipa je vezana na sezono, zato ima
 * QAP Postojna v pokalu in v Super ligi dve različni vrstici `league_teams`.
 * Če bi primerjali id-je, se izjema ne bi sprožila nikoli.
 *
 * Vrne `null`, kadar podatkov ne zadošča — klicatelj naj takrat vpraša
 * človeka in ne ugiba.
 */
export function superPokalUdelezenca(
  pokalniVrstniRed: Array<{ teamId: string; clubId: string | null }>,
  prvakSuperLige: { teamId: string; clubId: string | null } | null,
): SuperPokalPar | null {
  const prvak = pokalniVrstniRed[0]
  if (!prvak || !prvakSuperLige) return null

  const istiPrvak = prvak.clubId !== null
    && prvakSuperLige.clubId !== null
    && prvak.clubId === prvakSuperLige.clubId

  if (!istiPrvak) {
    return {
      domacin: { teamId: prvak.teamId, vloga: 'pokalni_prvak' },
      gost: { teamId: prvakSuperLige.teamId, vloga: 'prvak_super_lige' },
      istiPrvak: false,
    }
  }

  const podprvak = pokalniVrstniRed[1]
  if (!podprvak) return null
  return {
    domacin: { teamId: prvak.teamId, vloga: 'pokalni_prvak' },
    gost: { teamId: podprvak.teamId, vloga: 'pokalni_podprvak' },
    istiPrvak: true,
  }
}

/**
 * Strani tekme: domačin je VEDNO ekipa z mesta 1 (pokalni prvak).
 *
 * Podpis je enak kot pri `pokalniDomacin`, da je zamenjava na klicnem mestu
 * očitna, rang lige pa se namenoma NE upošteva.
 */
export function superPokalDomacin(
  mesto1: string,
  mesto2: string,
): [string, string] {
  return [mesto1, mesto2]
}

/** Super Pokal ima en sam krog in ta se imenuje Finale, ne »1. krog«. */
export function superPokalKrogi(): Array<{ stage: MatchStage; naslov: string }> {
  return [{ stage: 'final', naslov: 'Finale' }]
}

/** Ekipa sezone, kolikor je je potrebno za preverjanje vnosa. */
export interface SuperPokalEkipa {
  id: string
  club_name: string
  club_id?: string | null
  /** NULL pomeni, da ekipi vloga ni bila dodeljena. */
  draw_number: number | null
}

/**
 * Napake vnosa Super Pokala — v slovenščini, za izpis obiskovalcu.
 *
 * Preverjamo VSE vrstice ekip sezone in ne le tistih z mestom: ekipa brez
 * mesta je prav tako napaka vnosa, le da je brez tega nevidna. Prazen seznam
 * pomeni, da je vnos v redu.
 *
 * Pomembno je tudi, da samo ene ekipe NE spustimo naprej: pajek bi par
 * (ekipa, prosto) razglasil za prosto mesto in pokalnega prvaka označil za
 * zmagovalca BREZ tekme — tiho in brez napake.
 */
export function preveriSuperPokal(ekipe: SuperPokalEkipa[]): string[] {
  const napake: string[] = []

  if (ekipe.length !== 2) {
    napake.push(`Super Pokal ima natanko dve ekipi, vpisanih je ${ekipe.length}.`)
  }

  const brezMesta = ekipe.filter(e => e.draw_number === null)
  for (const e of brezMesta) {
    napake.push(`Ekipa ${e.club_name} nima dodeljenega mesta (1 = pokalni prvak, 2 = nasprotnik).`)
  }

  const mesta = ekipe.map(e => e.draw_number).filter((n): n is number => n !== null)
  if (!mesta.includes(MESTO_PRVAKA)) {
    napake.push('Mesto 1 ni dodeljeno — pokalni prvak in domačin nista določena.')
  }
  if (!mesta.includes(MESTO_NASPROTNIKA)) {
    napake.push('Mesto 2 ni dodeljeno — tekme za Super Pokal ni.')
  }
  for (const n of mesta) {
    if (n !== MESTO_PRVAKA && n !== MESTO_NASPROTNIKA) {
      napake.push(`Mesto ${n} v Super Pokalu ne obstaja — dovoljeni sta samo 1 in 2.`)
    }
  }
  if (new Set(mesta).size !== mesta.length) {
    napake.push('Isto mesto je dodeljeno dvakrat.')
  }

  const klubi = ekipe.map(e => e.club_id).filter((c): c is string => !!c)
  if (klubi.length === 2 && klubi[0] === klubi[1]) {
    napake.push('Obe ekipi sta iz istega kluba — Super Pokal igrata dve različni ekipi.')
  }

  return napake
}
