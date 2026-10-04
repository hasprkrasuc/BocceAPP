/**
 * ALI JE ZAPISNIK TEKME ŠE PRAZEN.
 *
 * Zakaj to sploh potrebujemo. Zamenjava domačina obrne strani tekme, zato je
 * ob izpolnjenem zapisniku nevarna: postave in izidi disciplin so vpisani
 * »doma« in »gost«, po obratu pa bi pripadli napačni ekipi. Varovalo v
 * `Pokal.tsx` je zato zamenjavo zavrnilo, brž ko je za tekmo OBSTAJALA
 * vrstica v `league_match_results`.
 *
 * Obstoj vrstice pa ne pomeni, da je v zapisniku kaj. Odpiranje »Uredi
 * zapisnik« vrstico in prazne vrstice disciplin ustvari vnaprej, zato je že
 * sam OGLED zapisnika trajno zaklenil gumb za menjavo domačina — na pokalu
 * članic 2026 natanko to: zapisnik Šiška–Sivke je nastal ob odprtju, bil je
 * prazen, menjava pa ni bila več mogoča.
 *
 * Zato se odslej vprašamo po VSEBINI. Prazen je zapisnik, ki nima ničesar v
 * glavi (sodniki, gledalci, ura konca, žreb) in nobene discipline z izidom,
 * match točkami, igriščem ali postavo. Tak zapisnik se ob obratu strani nima
 * česa narobe pripisati.
 *
 * Merilo je namenoma ŠIROKO: karkoli vpisanega pomeni »ni prazen«. Ob dvomu
 * raje zavrnemo menjavo, kot da tiho obrnemo tuje podatke.
 */

/** Glava zapisnika — polja, ki jih vpiše sodnik pred disciplinami. */
export interface GlavaZapisnika {
  judges?: string | null
  chief_judge?: string | null
  viewers?: number | null
  time_end?: string | null
  draw_natancno_field?: number | null
  draw_blok4?: Record<string, number> | null
}

/** Ena disciplina zapisnika. */
export interface VrsticaDiscipline {
  playground_number?: number | null
  home_score?: number | null
  away_score?: number | null
  home_match_points?: number | null
  away_match_points?: number | null
  home_players?: (string | null)[] | null
  away_players?: (string | null)[] | null
}

export interface Zapisnik extends GlavaZapisnika {
  discipline_results?: VrsticaDiscipline[] | null
}

/** Ali je v postavi kdo vpisan (prazni nizi in null ne štejejo). */
function imaPostavo(igralci: (string | null)[] | null | undefined): boolean {
  return (igralci ?? []).some(p => typeof p === 'string' && p.trim() !== '')
}

/** Ali je v glavi zapisnika karkoli vpisano. */
function glavaImaVsebino(z: GlavaZapisnika): boolean {
  if (z.judges && z.judges.trim() !== '') return true
  if (z.chief_judge && z.chief_judge.trim() !== '') return true
  if (z.viewers !== null && z.viewers !== undefined) return true
  if (z.time_end && String(z.time_end).trim() !== '') return true
  if (z.draw_natancno_field !== null && z.draw_natancno_field !== undefined) return true
  if (z.draw_blok4 && Object.keys(z.draw_blok4).length > 0) return true
  return false
}

/** Ali ima disciplina karkoli vpisanega. */
function disciplinaImaVsebino(d: VrsticaDiscipline): boolean {
  if (d.home_score !== null && d.home_score !== undefined) return true
  if (d.away_score !== null && d.away_score !== undefined) return true
  if (d.home_match_points !== null && d.home_match_points !== undefined) return true
  if (d.away_match_points !== null && d.away_match_points !== undefined) return true
  if (d.playground_number !== null && d.playground_number !== undefined) return true
  return imaPostavo(d.home_players) || imaPostavo(d.away_players)
}

/**
 * Ali so VSI zapisniki tekme še prazni.
 *
 * Tekma brez zapisnika je prazna — vrne `true`. Tako klicatelju ni treba
 * ločiti »zapisnika ni« od »zapisnik je prazen«: za menjavo domačina je oboje
 * enako varno.
 */
export function zapisnikJePrazen(zapisniki: Zapisnik[] | null | undefined): boolean {
  for (const z of zapisniki ?? []) {
    if (glavaImaVsebino(z)) return false
    if ((z.discipline_results ?? []).some(disciplinaImaVsebino)) return false
  }
  return true
}
