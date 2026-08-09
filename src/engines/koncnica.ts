/**
 * KONČNICA NA DVE DOBLJENI TEKMI — Super liga.
 *
 * Po 18 kolih rednega dela se najboljše štiri ekipe pomerijo v polfinalu,
 * zmagovalca pa v finalu. Vsak dvoboj je serija na dve dobljeni tekmi.
 *
 * Pari polfinala: 1. proti 4. in 2. proti 3. Za tretje mesto se NE igra.
 *
 * PREDNOST DOMAČEGA: 1. tekma pri višje uvrščenem, 2. pri nižje uvrščenem,
 * morebitna 3. spet pri višje uvrščenem. Višje uvrščen je tisti z boljšim
 * mestom po rednem delu — tudi v finalu, kjer se primerja uvrstitev iz
 * rednega dela, ne pot skozi polfinale.
 *
 * Vse tri tekme serije nastanejo naenkrat. Če se serija konča z 2:0, tretja
 * ostane neodigrana — enako, kot je bilo v prejšnjih sezonah, in prikaz jo
 * označi kot »ni bila odigrana«. Tako se izogne temu, da bi bilo treba med
 * sezono karkoli dogenerirati.
 *
 * Kola se štejejo naprej: pri 18 kolih rednega dela gre polfinale v kola
 * 19-21, finale v 22-24. Faza je zapisana v group_label ('SF1', 'SF2', 'F'),
 * da je prikaz ne ugiba iz števila tekem v kolu — pri seriji na dve dobljeni
 * ima namreč lahko tudi polfinalno kolo eno samo tekmo, če je druga dvojica
 * že končala.
 *
 * Čista logika brez I/O.
 */

/** Faza končnice; zapiše se v league_fixtures.group_label. */
export type KoncnicaFaza = 'SF1' | 'SF2' | 'F' | '3M'

export const KONCNICA_FAZE: Record<KoncnicaFaza, string> = {
  SF1: 'Polfinale 1 (1.–4.)',
  SF2: 'Polfinale 2 (2.–3.)',
  F: 'Finale',
  '3M': 'Za 3. mesto',
}

/** Koliko zmag dobi serijo. */
export const ZMAG_ZA_SERIJO = 2
/** Največ tekem v seriji. */
export const TEKEM_V_SERIJI = 3

export interface KoncnicaEkipa {
  id: string
  /** Uvrstitev po rednem delu, 1..4. */
  position: number
}

export interface KoncnicaTekma {
  round_number: number
  home_team_id: string
  away_team_id: string
  group_label: KoncnicaFaza
  /** Katera tekma serije: 1, 2 ali 3. */
  tekma: number
}

/** Izid ene odigrane tekme serije. */
export interface IzidTekme {
  home_team_id: string
  away_team_id: string
  home_score: number | null
  away_score: number | null
  status: string
}

/**
 * Tri tekme ene serije. Stran določa uvrstitev, ne vrstni red argumentov:
 * 1. in 3. pri višje uvrščenem, 2. pri nižje.
 */
export function serija(
  visji: string,
  nizji: string,
  faza: KoncnicaFaza,
  prvoKolo: number,
): KoncnicaTekma[] {
  if (visji === nizji) {
    throw new Error('Serija končnice: ekipa ne more igrati sama s sabo.')
  }
  // [doma, gost] za 1., 2. in 3. tekmo
  const strani: [string, string][] = [
    [visji, nizji],
    [nizji, visji],
    [visji, nizji],
  ]
  return strani.map(([home, away], i) => ({
    round_number: prvoKolo + i,
    home_team_id: home,
    away_team_id: away,
    group_label: faza,
    tekma: i + 1,
  }))
}

/** Preveri, da so uvrstitve natanko 1..4 brez ponovitev, in vrne id po mestu. */
function idPoMestu(top4: KoncnicaEkipa[]): Map<number, string> {
  if (top4.length !== 4) {
    throw new Error(`Končnica: potrebne so natanko 4 ekipe (podano ${top4.length}).`)
  }
  const m = new Map<number, string>()
  for (const e of top4) {
    if (!Number.isInteger(e.position) || e.position < 1 || e.position > 4) {
      throw new Error(`Končnica: uvrstitev mora biti 1..4 (dobljeno ${e.position}).`)
    }
    if (m.has(e.position)) throw new Error(`Končnica: podvojena uvrstitev ${e.position}.`)
    m.set(e.position, e.id)
  }
  if (new Set(top4.map(e => e.id)).size !== 4) {
    throw new Error('Končnica: ista ekipa je navedena večkrat.')
  }
  return m
}

/**
 * Polfinale: 1.–4. (SF1) in 2.–3. (SF2), vsak po tri tekme.
 * @param prvoKolo prvo kolo polfinala (pri 18 kolih rednega dela je to 19)
 */
export function polfinale(top4: KoncnicaEkipa[], prvoKolo: number): KoncnicaTekma[] {
  const m = idPoMestu(top4)
  return [
    ...serija(m.get(1)!, m.get(4)!, 'SF1', prvoKolo),
    ...serija(m.get(2)!, m.get(3)!, 'SF2', prvoKolo),
  ]
}

/**
 * Zmagovalec serije na dve dobljeni. Vrne id ali null, če serija še ni
 * odločena. Neodigrane tekme se ne štejejo, neodločenih v končnici ni —
 * če se tekma konča z enakim izidom, se ne šteje nikomur.
 */
export function zmagovalecSerije(tekme: IzidTekme[]): string | null {
  const zmage = new Map<string, number>()
  for (const t of tekme) {
    if (t.status !== 'completed') continue
    const hs = t.home_score ?? 0, as_ = t.away_score ?? 0
    if (hs === as_) continue
    const zmagovalec = hs > as_ ? t.home_team_id : t.away_team_id
    zmage.set(zmagovalec, (zmage.get(zmagovalec) ?? 0) + 1)
  }
  for (const [id, n] of zmage) if (n >= ZMAG_ZA_SERIJO) return id
  return null
}

/** Ali je serija odločena (in tretja tekma torej ni potrebna). */
export function serijaOdlocena(tekme: IzidTekme[]): boolean {
  return zmagovalecSerije(tekme) !== null
}

/**
 * Finale iz zmagovalcev obeh polfinalov. Prednost domačega dobi tisti z
 * boljšo uvrstitvijo po REDNEM DELU, ne glede na to, skozi kateri polfinale
 * je prišel.
 * @param prvoKolo prvo kolo finala (pri 18 kolih rednega dela je to 22)
 */
export function finale(
  zmagovalecSF1: string,
  zmagovalecSF2: string,
  top4: KoncnicaEkipa[],
  prvoKolo: number,
): KoncnicaTekma[] {
  const mesto = new Map(top4.map(e => [e.id, e.position]))
  const a = mesto.get(zmagovalecSF1), b = mesto.get(zmagovalecSF2)
  if (a === undefined || b === undefined) {
    throw new Error('Finale: zmagovalec polfinala ni med najboljšimi štirimi iz rednega dela.')
  }
  const [visji, nizji] = a < b ? [zmagovalecSF1, zmagovalecSF2] : [zmagovalecSF2, zmagovalecSF1]
  return serija(visji, nizji, 'F', prvoKolo)
}

/** Prvo kolo polfinala pri danem številu kol rednega dela. */
export const prvoKoloPolfinala = (kolRednegaDela: number) => kolRednegaDela + 1
/** Prvo kolo finala. */
export const prvoKoloFinala = (kolRednegaDela: number) => kolRednegaDela + 1 + TEKEM_V_SERIJI

// ────────────────────────────────────────────────────────────────
// ZAKLJUČNI TURNIR NAJBOLJŠIH ŠTIRIH (U18, U14)
//
// Mladinski ligi končata z enodnevnim turnirjem na enem igrišču: polfinala
// 1.–4. in 2.–3., nato finale in tekma za 3. mesto. Vsaka tekma je ENA sama,
// ne serija — v tem se turnir loči od končnice Super lige.
//
// Ker se igra na nevtralnem igrišču, je domačin le zapis v razporedu. Po
// dogovoru je kot domača navedena bolje uvrščena ekipa iz rednega dela; kraj
// se vnese ročno, ker ga razpored ne določa.
//
// Turnir nastane v dveh korakih, ker finale in tekma za 3. mesto nista znana,
// dokler polfinala nista odigrana: najprej polfinala, po vpisu izidov pa še
// zaključek. Oba koraka gresta v svoje kolo, tudi kadar se igrata isti dan.
// ────────────────────────────────────────────────────────────────

/** Ena tekma turnirja (brez serije — `tekma` je vedno 1). */
export type TurnirTekma = KoncnicaTekma

/**
 * Polfinala zaključnega turnirja: 1.–4. in 2.–3., po ena tekma, v istem kolu.
 * @param kolo kolo polfinalov (prvo kolo za rednim delom)
 */
export function turnirPolfinala(top4: KoncnicaEkipa[], kolo: number): TurnirTekma[] {
  const m = idPoMestu(top4)
  const tekma = (visji: string, nizji: string, faza: KoncnicaFaza): TurnirTekma => ({
    round_number: kolo,
    home_team_id: visji,
    away_team_id: nizji,
    group_label: faza,
    tekma: 1,
  })
  return [tekma(m.get(1)!, m.get(4)!, 'SF1'), tekma(m.get(2)!, m.get(3)!, 'SF2')]
}

/** Zmagovalec ene tekme; null, kadar ni odigrana ali se je končala neodločeno. */
export function zmagovalecTekme(t: IzidTekme): string | null {
  if (t.status !== 'completed') return null
  const hs = t.home_score ?? 0, as_ = t.away_score ?? 0
  if (hs === as_) return null
  return hs > as_ ? t.home_team_id : t.away_team_id
}

/** Poraženec ene tekme; null pod istimi pogoji kot zmagovalec. */
export function porazenecTekme(t: IzidTekme): string | null {
  const z = zmagovalecTekme(t)
  if (!z) return null
  return z === t.home_team_id ? t.away_team_id : t.home_team_id
}

/**
 * Finale in tekma za 3. mesto iz odigranih polfinalov. Obe tekmi sta v istem
 * kolu; domača je v obeh bolje uvrščena ekipa iz REDNEGA dela.
 *
 * @throws če kateri polfinale ni odigran ali se je končal neodločeno — v
 *         izločilnem delu neodločen izid ne določi, kdo gre naprej, in tega
 *         program ne sme ugibati.
 */
export function turnirZakljucek(
  polfinale1: IzidTekme,
  polfinale2: IzidTekme,
  top4: KoncnicaEkipa[],
  kolo: number,
): TurnirTekma[] {
  const mesto = new Map(top4.map(e => [e.id, e.position]))
  const zmag1 = zmagovalecTekme(polfinale1), zmag2 = zmagovalecTekme(polfinale2)
  const por1 = porazenecTekme(polfinale1), por2 = porazenecTekme(polfinale2)
  if (!zmag1 || !zmag2) {
    throw new Error('Zaključni turnir: oba polfinala morata biti odigrana in odločena (neodločen izid ne določi, kdo gre naprej).')
  }
  for (const id of [zmag1, zmag2, por1!, por2!]) {
    if (!mesto.has(id)) throw new Error('Zaključni turnir: ekipa iz polfinala ni med najboljšimi štirimi iz rednega dela.')
  }

  const par = (a: string, b: string, faza: KoncnicaFaza): TurnirTekma => {
    const [visji, nizji] = (mesto.get(a)! < mesto.get(b)!) ? [a, b] : [b, a]
    return { round_number: kolo, home_team_id: visji, away_team_id: nizji, group_label: faza, tekma: 1 }
  }
  return [par(zmag1, zmag2, 'F'), par(por1!, por2!, '3M')]
}
