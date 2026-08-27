/**
 * STANJE ZAPISNIKA — ali je tekma sploh že odigrana
 *
 * Zapisnik se odpre tudi pred tekmo: sodnik vanj vpiše postave, igrišče in
 * datum. Doslej je vsako shranjevanje tekmo označilo za odigrano in ji zapisalo
 * vsoto — tudi kadar ni bilo vpisane nobene ocene. Nastalo je deset tekem s
 * statusom `completed` in rezultatom 0:0, med njimi Super Liga 1. in 2. kolo z
 * datumi 31. 10. in 7. 11. 2026, torej tekme, ki še niso bile igrane.
 *
 * To ni le kozmetika: lestvica šteje izključno tekme s `completed`, zato je
 * teh deset v njej stalo kot odigranih z 0:0.
 *
 * PRAVILO (dogovorjeno z lastnikom projekta 27. 8. 2026): skupni rezultat se
 * začne vpisovati šele, ko sodnik ali admin vpiše prvo oceno discipline. Dokler
 * ni vpisana nobena, tekma ostane `scheduled` in brez rezultata.
 *
 * Zakaj je 0:0 zanesljivo znamenje praznega zapisnika: točke se pri vsaki
 * odigrani disciplini razdelijo (2:0, 0:2 ali 1:1), zato vsota nikoli ne more
 * biti 0:0, če je bila vpisana vsaj ena disciplina.
 */

/** Ena vrstica zapisnika, kakor jo hrani obrazec — oceni sta niza iz vnosnega polja. */
export interface VnosDiscipline {
  homeScore: string
  awayScore: string
}

export interface StanjeZapisnika {
  /** Discipline z obema vpisanima ocenama. */
  vpisanih: number
  /** Skupne točke; `null`, dokler ni vpisana nobena disciplina. */
  tocke: { domaci: number; gostje: number } | null
  /** Skupaj osvojene punte (le za prikaz, v lestvico ne gredo neposredno). */
  punti: { domaci: number; gostje: number }
  /** Kar naj se zapiše v league_fixtures.status. */
  status: 'scheduled' | 'completed'
}

/**
 * Točke ene discipline: zmaga 2, izenačeno 1:1, poraz 0.
 *
 * `null` pomeni, da discipline ni mogoče oceniti — manjka vsaj ena ocena.
 * Prej je ta funkcija živela v LeagueMatchScoresheet in bila podvojena še v
 * predstavitveni različici; pravilo tekmovanja sodi v motor in dobi test.
 */
export function tockeDiscipline(h: string, a: string): [0 | 1 | 2, 0 | 1 | 2] | null {
  if (!h || !a) return null
  const hn = Number(h), an = Number(a)
  if (!Number.isFinite(hn) || !Number.isFinite(an)) return null
  if (hn > an) return [2, 0]
  if (an > hn) return [0, 2]
  return [1, 1]   // izenačeno — vsaka ekipa dobi 1 točko
}

/**
 * Presodi zapisnik kot celoto.
 *
 * Vrne `tocke: null`, dokler ni ocenjena nobena disciplina — klicatelj naj v
 * tem primeru pusti `home_score` in `away_score` prazna, ne pa zapiše ničel.
 */
export function stanjeZapisnika(vnosi: readonly VnosDiscipline[]): StanjeZapisnika {
  let domaci = 0, gostje = 0, vpisanih = 0
  let puntD = 0, puntG = 0

  for (const v of vnosi) {
    const pts = tockeDiscipline(v.homeScore, v.awayScore)
    if (pts) { domaci += pts[0]; gostje += pts[1]; vpisanih++ }
    // Punti se seštevajo tudi pri enostransko vpisani disciplini: prikaz sme
    // teči med vnašanjem, točke pa se dodelijo šele, ko sta znani obe oceni.
    if (v.homeScore) puntD += Number(v.homeScore) || 0
    if (v.awayScore) puntG += Number(v.awayScore) || 0
  }

  return {
    vpisanih,
    tocke: vpisanih > 0 ? { domaci, gostje } : null,
    punti: { domaci: puntD, gostje: puntG },
    status: vpisanih > 0 ? 'completed' : 'scheduled',
  }
}
