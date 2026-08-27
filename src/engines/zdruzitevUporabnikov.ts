/**
 * ZDRUŽITEV DVEH ZAPISOV ISTE OSEBE
 *
 * Uvoz igralcev zna ustvariti drugi zapis za človeka, ki v bazi že je — kadar
 * v evidenci nima ne e-naslova ne EMŠO ne datuma rojstva, ga nima po čem ujeti.
 * Tako so nastali Mohinski, Vehovec, Šumi in Brus. Doslej smo jih združevali
 * ročno v SQL; ta motor pravila zapiše enkrat, da jih ni treba vsakič znova
 * uganiti.
 *
 * NAJPOMEMBNEJŠE: seznam SKLICEV. Uporabnik se v bazi pojavi na 14 mestih in
 * ob združitvi je treba VSA prestaviti na obdržani zapis. Če se eno spregleda,
 * se zgodi ena od dveh reči — in nobena ni glasna:
 *
 *   - pri CASCADE se vrstica ob brisu tiho izbriše (statistika, dvojna
 *     registracija, ligaški admin),
 *   - pri stolpcih BREZ tujega ključa (judge_ids, home_players, away_players)
 *     baza brisa sploh ne ovira in v zapisniku ostane id, ki ne pripada nikomur.
 *
 * Zadnje tri so torej najnevarnejše, čeprav so videti najbolj nedolžne: to so
 * postave v zapisnikih tekem in sodniki, kjer id-ji stojijo kot navadni nizi.
 *
 * Motor sam ne piše v bazo — prestavljanje opravi api/user-merge.ts, ki bere
 * prav ta seznam. Ločeno je zato, da se pravila dajo testirati brez baze.
 */

import { ROLE_ORDER } from '../lib/roles'
import { isGenericEmail } from '../lib/genericEmail'
import type { UserRole } from '../types'

// ──────────────────────────────────────────────────────────────
// KJE VSE STOJI ID UPORABNIKA
// ──────────────────────────────────────────────────────────────

/**
 * - `fk`    navaden stolpec s tujim ključem
 * - `polje` uuid[] (league_fixtures.judge_ids)
 * - `jsonb` seznam id-jev, zapisanih kot nizi
 */
export type VrstaSklica = 'fk' | 'polje' | 'jsonb'

export interface Sklic {
  tabela: string
  stolpec: string
  vrsta: VrstaSklica
  /** Ravnanje tujega ključa ob brisu uporabnika; `null` pomeni, da ključa ni. */
  obBrisu: 'CASCADE' | 'SET NULL' | 'NO ACTION' | null
  opis: string
}

/**
 * Preverjeno proti produkcijski shemi 26. 8. 2026 s poizvedbo po `pg_constraint`
 * (contype='f', confrelid='public.users'). Ob vsakem novem stolpcu, ki hrani id
 * uporabnika, DODAJ vrstico sem — test `vsi sklici imajo tabelo in stolpec`
 * tega ne more ujeti namesto tebe, ker seznama ne pozna nihče drug.
 */
export const SKLICI: readonly Sklic[] = [
  // ── s tujim ključem ──
  { tabela: 'league_team_players', stolpec: 'player_id', vrsta: 'fk', obBrisu: 'NO ACTION', opis: 'članstvo v ligaški ekipi' },
  { tabela: 'player_statistics', stolpec: 'player_id', vrsta: 'fk', obBrisu: 'CASCADE', opis: 'statistika igralca' },
  { tabela: 'double_registrations', stolpec: 'player_id', vrsta: 'fk', obBrisu: 'CASCADE', opis: 'dvojna registracija' },
  { tabela: 'double_registrations', stolpec: 'resolved_by', vrsta: 'fk', obBrisu: 'NO ACTION', opis: 'kdor je odločil o dvojni registraciji' },
  { tabela: 'tournament_registrations', stolpec: 'player1_id', vrsta: 'fk', obBrisu: 'NO ACTION', opis: 'prijava na turnir (prvi igralec)' },
  { tabela: 'tournament_registrations', stolpec: 'player2_id', vrsta: 'fk', obBrisu: 'NO ACTION', opis: 'prijava na turnir (drugi igralec)' },
  { tabela: 'league_teams', stolpec: 'captain_id', vrsta: 'fk', obBrisu: 'NO ACTION', opis: 'kapetan ekipe' },
  { tabela: 'league_fixtures', stolpec: 'chief_judge_id', vrsta: 'fk', obBrisu: 'SET NULL', opis: 'glavni sodnik tekme' },
  { tabela: 'matches', stolpec: 'judge_id', vrsta: 'fk', obBrisu: 'SET NULL', opis: 'sodnik turnirske tekme' },
  { tabela: 'tournament_groups', stolpec: 'judge_id', vrsta: 'fk', obBrisu: 'SET NULL', opis: 'sodnik skupine' },
  { tabela: 'league_season_admins', stolpec: 'user_id', vrsta: 'fk', obBrisu: 'CASCADE', opis: 'ligaški admin' },
  // ── BREZ tujega ključa: baza jih ne varuje ──
  { tabela: 'league_fixtures', stolpec: 'judge_ids', vrsta: 'polje', obBrisu: null, opis: 'sodniki tekme' },
  { tabela: 'league_match_discipline_results', stolpec: 'home_players', vrsta: 'jsonb', obBrisu: null, opis: 'postava domačih v zapisniku' },
  { tabela: 'league_match_discipline_results', stolpec: 'away_players', vrsta: 'jsonb', obBrisu: null, opis: 'postava gostov v zapisniku' },
]

export const kljucSklica = (s: Sklic): string => `${s.tabela}.${s.stolpec}`

/** Koliko sklicev nosi zapis, po ključu `tabela.stolpec`. Manjkajoč ključ = 0. */
export type Stetje = Readonly<Record<string, number>>

export function skupajSklicev(stetje: Stetje | undefined | null): number {
  if (!stetje) return 0
  return Object.values(stetje).reduce((v, n) => v + (Number.isFinite(n) ? n : 0), 0)
}

/** Sklici, ki bi se ob brisu tiho izgubili, če jih ne bi prestavili. */
export function tihaIzguba(stetje: Stetje | undefined | null): Sklic[] {
  if (!stetje) return []
  return SKLICI.filter(s => (stetje[kljucSklica(s)] ?? 0) > 0 && s.obBrisu !== 'NO ACTION')
}

// ──────────────────────────────────────────────────────────────
// KATEREGA OBDRŽATI
// ──────────────────────────────────────────────────────────────

/**
 * Neobvezna polja so takšna zato, da je `UserProfile` (ki jih nekaj ne razglaša,
 * ker so občutljiva in pridejo šele iz pogleda `users_sensitive`) tu uporaben
 * neposredno, brez preslikave.
 */
export interface ZapisZaZdruzitev {
  id: string
  full_name: string | null
  email?: string | null
  emso?: string | null
  date_of_birth?: string | null
  license_number?: string | null
  gender?: string | null
  club_id: string | null
  /** Klub, kot je zapisan na obrazcu — ni nujno enak imenu povezanega kluba. */
  club?: string | null
  photo_url?: string | null
  role: UserRole
  created_at?: string | null
}

export interface Izbira {
  obdrzan: ZapisZaZdruzitev
  opusceni: ZapisZaZdruzitev
  razlog: string
}

/**
 * Obdrži zapis z VEČ sklici, ob izenačenju starejšega.
 *
 * Zakaj po sklicih in ne kar po starosti: vsak prestavljen sklic je poseg, ki
 * lahko spodleti, obdržani zapis pa svoje sklice ohrani brez dotika. Manj
 * prestavljanja pomeni manj priložnosti za napako.
 *
 * Ob izenačenju odloči starost, ker je starejši zapis tisti, na katerega so
 * se sklicevali dlje — tudi tam, kjer sklicev ne štejemo (npr. tuja poročila).
 */
export function izberiObdrzanega(
  a: ZapisZaZdruzitev, stetjeA: Stetje | undefined,
  b: ZapisZaZdruzitev, stetjeB: Stetje | undefined,
): Izbira {
  const nA = skupajSklicev(stetjeA)
  const nB = skupajSklicev(stetjeB)
  if (nA !== nB) {
    const prvi = nA > nB
    return {
      obdrzan: prvi ? a : b,
      opusceni: prvi ? b : a,
      razlog: `nosi več sklicev (${Math.max(nA, nB)} proti ${Math.min(nA, nB)})`,
    }
  }
  // Manjkajoč datum nastanka ne sme odločati: kadar ga ni na nobeni strani, sta
  // vrednosti enaki in obvelja prvi argument — kar je vseeno, ker sta zapisa po
  // vseh znanih merilih izenačena.
  const aStarejsi = (a.created_at ?? '') <= (b.created_at ?? '')
  return {
    obdrzan: aStarejsi ? a : b,
    opusceni: aStarejsi ? b : a,
    razlog: nA === 0
      ? 'starejši zapis (noben ne nosi sklicev)'
      : `starejši zapis (oba nosita ${nA} sklicev)`,
  }
}

// ──────────────────────────────────────────────────────────────
// KAJ SE PRENESE
// ──────────────────────────────────────────────────────────────

/** Polja, ki se prenesejo z opuščenega, kadar jih obdržani nima. */
const PRENOSLJIVA = [
  ['full_name', 'ime'],
  ['emso', 'EMŠO'],
  ['date_of_birth', 'datum rojstva'],
  ['license_number', 'številka licence'],
  ['gender', 'spol'],
  ['club_id', 'klub'],
  ['photo_url', 'fotografija'],
] as const

type Prenosljivo = (typeof PRENOSLJIVA)[number][0] | 'club'

const prazno = (v: unknown): boolean => v === null || v === undefined || v === ''

export interface Zdruzitev {
  /** Kar je treba zapisati na obdržani zapis. Prazen objekt = ni kaj zapisati. */
  patch: Partial<Record<Prenosljivo, string | null>>
  /** Prijazni opisi prevzetih polj, za prikaz pred potrditvijo. */
  prevzeto: string[]
  /** Vloga po združitvi — višja od obeh. */
  vloga: UserRole
  /** Prijavni naslov, ki naj obvelja, ali `null`, kadar ostane obdržanega. */
  naslov: string | null
}

/**
 * Zlije podatke: obdržani zapis obdrži svoje, prazna polja pa dobi z opuščenega.
 * Nasprotujočih si vrednosti NE prepisuje — nanje opozori `preveriZdruzitev`,
 * odloči pa človek.
 */
export function zdruzenaPolja(obdrzan: ZapisZaZdruzitev, opusceni: ZapisZaZdruzitev): Zdruzitev {
  const patch: Partial<Record<Prenosljivo, string | null>> = {}
  const prevzeto: string[] = []
  for (const [polje, opis] of PRENOSLJIVA) {
    if (prazno(obdrzan[polje]) && !prazno(opusceni[polje])) {
      patch[polje] = opusceni[polje] as string
      prevzeto.push(opis)
    }
  }

  // club_id in club POTUJETA SKUPAJ. Besedilno polje je klub, kakor ga je
  // zapisal obrazec, in se od imena povezanega kluba pri 1055 od 1319
  // uporabnikov razlikuje — največkrat kot okrajšava (»BŠK BUDNIČAR« proti
  // »BALINARSKI ŠPORTNI KLUB BUDNIČAR«). To samo po sebi ni napaka.
  //
  // Napaka nastane ob združitvi: če prevzamemo povezavo, ne pa besedila,
  // zapis kaže na en klub, piše pa drug. Tako je Jože Zadnik 27. 8. 2026
  // ostal z besedilom »OBZ Sežana« in povezavo na BISTRC.
  //
  // Prožilec sync_user_club tega ne reši — besedilo zapolni le, kadar je
  // prazno, obstoječega pa nikoli ne popravi.
  if (patch.club_id !== undefined) {
    patch.club = opusceni.club ?? null
  }

  // Vloga: nižja se ob združitvi ne sme povoziti višje. Kdor je bil sodnik v
  // enem zapisu in igralec v drugem, mora ostati sodnik — sicer izgubi pravico
  // vpisovati zapisnike.
  const vloga = ROLE_ORDER.indexOf(opusceni.role) > ROLE_ORDER.indexOf(obdrzan.role)
    ? opusceni.role
    : obdrzan.role

  // Naslov: pravi predal premaga tistega, ki ga je dodelila aplikacija — sicer
  // bi združitev človeka pustila brez poti do ponastavitve gesla.
  const naslov = isGenericEmail(obdrzan.email) && !isGenericEmail(opusceni.email) && opusceni.email
    ? opusceni.email
    : null

  return { patch, prevzeto, vloga, naslov }
}

// ──────────────────────────────────────────────────────────────
// KDAJ ZDRUŽITVE NE SME BITI
// ──────────────────────────────────────────────────────────────

export interface Presoja {
  /** Združitev ni mogoča. */
  napake: string[]
  /** Združitev je mogoča, a naj jo človek prej pogleda. */
  opozorila: string[]
}

/**
 * Napake ustavijo, opozorila ne. Nasprotujoč EMŠO je namenoma le opozorilo:
 * najpogosteje pomeni dve različni osebi in združitve ne sme biti, včasih pa je
 * ena od vrednosti pokvarjena (takih je bilo v bazi 67) in združitev je prav
 * tisto, kar je treba narediti. Tega stroj ne loči, človek z evidenco pa ja.
 */
export function preveriZdruzitev(a: ZapisZaZdruzitev, b: ZapisZaZdruzitev): Presoja {
  const napake: string[] = []
  const opozorila: string[] = []

  if (a.id === b.id) napake.push('Izbran je dvakrat isti zapis.')

  const oba = (polje: Prenosljivo) => !prazno(a[polje]) && !prazno(b[polje])
  const razlicna = (polje: Prenosljivo) => oba(polje) && a[polje] !== b[polje]

  if (razlicna('emso')) {
    opozorila.push(
      `Zapisa imata različen EMŠO (${a.emso} proti ${b.emso}). To sta praviloma dve različni osebi — ` +
      'združi ju le, če veš, da je ena od vrednosti napačno prepisana.',
    )
  }
  if (razlicna('date_of_birth')) {
    opozorila.push(`Zapisa imata različen datum rojstva (${a.date_of_birth} proti ${b.date_of_birth}).`)
  }
  if (razlicna('license_number')) {
    opozorila.push(`Zapisa imata različno številko licence (${a.license_number} proti ${b.license_number}).`)
  }
  if (razlicna('club_id')) {
    opozorila.push('Zapisa sta vpisana v različna kluba — po združitvi ostane klub obdržanega zapisa.')
  }
  if (razlicna('gender')) {
    opozorila.push('Zapisa imata različno vpisan spol.')
  }
  if (ROLE_ORDER.indexOf(a.role) >= ROLE_ORDER.indexOf('admin') &&
      ROLE_ORDER.indexOf(b.role) >= ROLE_ORDER.indexOf('admin')) {
    opozorila.push('Oba zapisa imata skrbniške pravice — preveri, da res ne gre za dva človeka.')
  }

  return { napake, opozorila }
}
