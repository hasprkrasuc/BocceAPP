import { normalizirajDisciplino } from './tournamentPlacement'
import type { DisciplineType } from './leagueDisciplines'

/**
 * NAJVIŠJI REZULTAT TEKME — po disciplinah.
 *
 * Meja 13 točk je bila do zdaj zapisana v `ScoreModal` in je veljala za VSE
 * discipline. To je pravilo BALINANJA (igra se na 13 točk) in ne pravilo
 * tekmovanja nasploh: igra v krog, izbijanja in bližanja so točkovne
 * discipline, kjer je 13 povsem običajen vmesni izid.
 *
 * Posledica je bila vidna 23. 10. 2026 sredi DP Igra v krog: sodnik ni mogel
 * vpisati 18:19, ker sta bila oba rezultata nad 13. Ni šlo za opozorilo —
 * vnos je bil zavrnjen in tekme ni bilo mogoče zaključiti.
 *
 * Meje niso ugibane, ampak prebrane iz produkcijske baze (23. 10. 2026):
 *
 *   balinanje (dvojka, posamezno, brez discipline)   912 tekem, najvišji 13
 *   igra v krog                                      102 tekem, najvišji 32
 *
 * Pri balinanju je torej 13 res zgornja meja in ne le domneva — zato je
 * pogoj hkrati ZAOSTREN. Prej je vnos padel šele, če sta bila OBA rezultata
 * nad 13, tako da je 13:99 mirno shranil. Zdaj pade vsak rezultat nad ciljem.
 *
 * Zaostritev pa sme veljati samo tam, kjer disciplino ZARES poznamo — sicer
 * bi bila popravek v regresijo: izid 20:5 na tekmovanju brez vpisane
 * discipline je stara koda shranila, zaostrena pa bi ga zavrnila. Glej
 * `najvisjiRezultat`.
 */

/** Balinanje se igra na 13 točk. */
export const CILJ_BALINANJE = 13

/**
 * Discipline, ki se igrajo na 13 točk.
 *
 * Seznam je poimensko zaprt in ne privzeto vključujoč: nova točkovna
 * disciplina naj se obnaša kot krog (brez tekmovalne meje), ne kot balinanje.
 */
const NA_TRINAJST: ReadonlySet<DisciplineType> = new Set(['trojka', 'dvojka', 'posamezno'])

/**
 * Zgornja meja za točkovne discipline.
 *
 * NI tekmovalno pravilo — nobena disciplina nima cilja 200. Je samo lovilec
 * očitnih polomov vnosa (prilepljena telefonska številka, letnica). Najvišji
 * rezultat kroga v bazi je 32, zato je 200 dovolj daleč, da ne more nikomur
 * stati na poti. Če bi kdaj stala, jo dvigni — ne odstranjuj preverjanja.
 */
export const MEJA_RAZUMNOSTI = 200

/**
 * Najvišji smiselni rezultat za disciplino.
 *
 * Meja 13 velja SAMO, kadar je disciplina vpisana in je balinarska. Kadar je
 * ni ali je ne prepoznamo, velja ohlapna meja.
 *
 * Nezapisana disciplina je mamljivo šteti za balinanje — vseh 435 tekem brez
 * discipline v bazi ima res najvišji rezultat 13. A `discipline_type` je ob
 * ustvarjanju tekmovanja NEOBVEZEN (`TournamentAdmin`: `form.discipline_type
 * || null`) in ga pozneje ni mogoče popraviti, ker `TournamentEdit` polja
 * zanj nima — disciplino samo bere. Prvo prvenstvo v igri v krog, ki bi ga
 * kdo ustvaril brez izbrane discipline, bi tako spet obtičalo pri 18:19, iz
 * česar sodnik ne bi mogel sam, ker discipline nikjer ne more vpisati.
 *
 * Zato velja isto kot za neprepoznano disciplino: ne vemo, torej ne
 * ugibamo strogo. Zavrnjen vnos sodnika sredi tekmovanja je dražji od
 * prepuščenega tipkarskega spodrsljaja, ki ga je mogoče popraviti.
 */
export function najvisjiRezultat(discipline: string | null | undefined): number {
  const d = normalizirajDisciplino(discipline)
  if (d === null) return MEJA_RAZUMNOSTI
  return NA_TRINAJST.has(d) ? CILJ_BALINANJE : MEJA_RAZUMNOSTI
}

/** Ali se disciplina igra na 13 točk (za besedilo napake in za teste). */
export function seIgraNaTrinajst(discipline: string | null | undefined): boolean {
  return najvisjiRezultat(discipline) === CILJ_BALINANJE
}

/**
 * Preveri vnos rezultata. Vrne besedilo napake ali `null`, če je vnos v redu.
 *
 * Izenačenje ostaja prepovedano tudi pri točkovnih disciplinah: skupinske
 * napredovalce določa ZMAGOVALEC določene tekme (`GROUP_QUALIFIERS`), zato
 * tekma brez zmagovalca pajka ne bi napolnila. Neodločeno se razreši na
 * igrišču, ne v obrazcu.
 */
export function preveriRezultat(
  a: number,
  b: number,
  discipline: string | null | undefined,
): string | null {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 'Vnesi veljavni rezultat'
  if (!Number.isInteger(a) || !Number.isInteger(b)) return 'Rezultat mora biti celo število'
  if (a < 0 || b < 0) return 'Rezultat ne more biti negativen'
  if (a === b) return 'Izenačen rezultat ni dovoljen v bocce'

  const najvec = najvisjiRezultat(discipline)
  if (a > najvec || b > najvec) {
    return seIgraNaTrinajst(discipline)
      ? `Balinanje se igra na ${CILJ_BALINANJE} točk — preveri vnos`
      : `Rezultat presega ${najvec} točk — preveri vnos`
  }
  return null
}
