/**
 * UVRSTITVENE TOČKE EKIP — Super liga in Pokal BZS.
 *
 * V rang lestvico poleg odigranih tekem šteje tudi KONČNA UVRSTITEV ekipe:
 * vsak igralec ekipe (postava iz `league_team_players`) dobi točke po mestu.
 *
 *   Super liga:  1. m. 16 · 2. m. 10 · 3. m. 8 · 4. m. 7
 *   Pokal BZS:   polovico tega (8 · 5 · 4 · 3.5)
 *
 * Velja za moške in ženske — točke gredo v rang kategorijo sezone.
 *
 * Čista logika brez I/O; kdo je na katerem mestu, pove `koncnaUvrstitevLige`
 * (liga s končnico ali brez) oziroma `pokalneUvrstitve` v engines/pokal.ts.
 */

import { TEKEM_V_SERIJI, ZMAG_ZA_SERIJO } from './koncnica'

/** Točke za končno uvrstitev v Super ligi (za vsakega igralca ekipe). */
export function tockeUvrstitveSuperLiga(mesto: number): number {
  if (mesto === 1) return 16
  if (mesto === 2) return 10
  if (mesto === 3) return 8
  if (mesto === 4) return 7
  return 0
}

/** Točke za končno uvrstitev v Pokalu BZS — polovica superligaških. */
export function tockeUvrstitvePokal(mesto: number): number {
  return tockeUvrstitveSuperLiga(mesto) / 2
}

/** Tekma končnice, kot pride iz `league_fixtures` (group_label SF1/SF2/F/3M). */
export interface KoncnicaIzid {
  group_label: string | null
  home_team_id: string
  away_team_id: string
  home_score: number | null
  away_score: number | null
  status: string
}

const FAZE_KONCNICE = new Set(['SF1', 'SF2', 'F', '3M'])

/** Zmage po ekipah v odigranih tekmah dane faze (neodločenih končnica ne pozna). */
function zmagePoEkipah(tekme: KoncnicaIzid[]): Map<string, number> {
  const zmage = new Map<string, number>()
  for (const t of tekme) {
    if (t.status !== 'completed') continue
    const hs = t.home_score ?? 0, as_ = t.away_score ?? 0
    if (hs === as_) continue
    const z = hs > as_ ? t.home_team_id : t.away_team_id
    zmage.set(z, (zmage.get(z) ?? 0) + 1)
  }
  return zmage
}

/**
 * Zmagovalec faze; null pri neodločeni. Serija na dve dobljeni ima v razporedu
 * tri tekme in zahteva dve zmagi (ena zmaga po prvi tekmi serije ne odloči);
 * faza z eno samo tekmo (final four) je odločena z eno.
 */
function zmagovalecFaze(tekme: KoncnicaIzid[]): string | null {
  const potrebneZmage = tekme.length >= TEKEM_V_SERIJI ? ZMAG_ZA_SERIJO : 1
  const zmage = zmagePoEkipah(tekme)
  const urejeno = [...zmage.entries()].sort((a, b) => b[1] - a[1])
  if (urejeno.length === 0 || urejeno[0][1] < potrebneZmage) return null
  if (urejeno.length > 1 && urejeno[0][1] === urejeno[1][1]) return null
  return urejeno[0][0]
}

/** Ekipe, ki v fazi nastopajo (iz razporeda, ne le odigranih tekem). */
function udelezenca(tekme: KoncnicaIzid[]): string[] {
  return [...new Set(tekme.flatMap(t => [t.home_team_id, t.away_team_id]))]
}

/**
 * Končna uvrstitev lige: mesta 1–4 po ekipah.
 *
 * Brez končnice je uvrstitev kar vrstni red lestvice rednega dela. S končnico
 * (group_label SF1/SF2/F, po želji 3M) da finale 1. in 2. mesto; 3. in 4.
 * določi tekma za 3. mesto, brez nje pa se poraženca polfinalov razvrstita po
 * lestvici rednega dela (tako 3. mesto podeljujejo superligaška pravila).
 * Deluje za serijo na dve dobljeni in za eno samo tekmo — šteje, kdo je v
 * fazi zbral več zmag.
 *
 * Vrne samo ODLOČENA mesta — nedokončana končnica jih ne ugiba.
 *
 * @param vrstniRed id-ji ekip po lestvici rednega dela, od 1. mesta navzdol
 */
export function koncnaUvrstitevLige(
  vrstniRed: string[],
  tekme: KoncnicaIzid[],
): Map<string, number> {
  const mesta = new Map<string, number>()
  const koncnica = tekme.filter(t => t.group_label && FAZE_KONCNICE.has(t.group_label))

  if (koncnica.length === 0) {
    vrstniRed.slice(0, 4).forEach((id, i) => mesta.set(id, i + 1))
    return mesta
  }

  const faza = (l: string) => koncnica.filter(t => t.group_label === l)
  const finale = faza('F')
  const prvi = zmagovalecFaze(finale)
  if (!prvi) return mesta
  mesta.set(prvi, 1)
  const drugi = udelezenca(finale).find(id => id !== prvi)
  if (drugi) mesta.set(drugi, 2)

  const tekmaZa3 = faza('3M')
  if (tekmaZa3.length > 0) {
    const tretji = zmagovalecFaze(tekmaZa3)
    if (tretji) {
      mesta.set(tretji, 3)
      const cetrti = udelezenca(tekmaZa3).find(id => id !== tretji)
      if (cetrti) mesta.set(cetrti, 4)
    }
  } else {
    // Poraženca polfinalov po lestvici rednega dela.
    const porazenca = [...faza('SF1'), ...faza('SF2')]
      .flatMap(t => [t.home_team_id, t.away_team_id])
      .filter((id, i, arr) => arr.indexOf(id) === i && !mesta.has(id))
      .sort((a, b) => vrstniRed.indexOf(a) - vrstniRed.indexOf(b))
    porazenca.slice(0, 2).forEach((id, i) => mesta.set(id, 3 + i))
  }
  return mesta
}
