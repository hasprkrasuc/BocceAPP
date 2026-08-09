/**
 * Zaznavanje ročnih zamenjav domačina v razporedu.
 *
 * Zveze zaradi zasedenih igrišč pri posameznih tekmah zamenjajo domačina
 * (2. liga vzhod 2026/27: Budničar/Hoče v 5. in 10. kolu). Take zamenjave
 * niso v Bergerjevi tabeli, zato jih regeneracija razporeda povozi — in ker
 * se razpored ob tem izbriše in vpiše znova, se to zgodi tiho.
 *
 * Ta funkcija primerja obstoječi razpored z na novo sestavljenim in prešteje
 * tekme, kjer je ISTI par v ISTEM kolu, le strani sta obrnjeni. To je natanko
 * podpis ročne zamenjave — spremenjen par ali kolo je nekaj drugega (drug žreb)
 * in se tu ne šteje.
 */

interface Tekma {
  round_number: number
  home_team_id: string
  away_team_id: string
}

const kljuc = (r: number, h: string, a: string) => `${r}|${h}|${a}`

/**
 * Tekme, ki imajo v obstoječem razporedu obrnjenega domačina glede na novega.
 * @returns seznam kol (z morebitnimi ponovitvami, po eno na zamenjano tekmo)
 */
export function zamenjaniDomacini(obstojece: Tekma[], nove: Tekma[]): number[] {
  const noveTekme = new Set(nove.map(f => kljuc(f.round_number, f.home_team_id, f.away_team_id)))
  return obstojece
    .filter(f =>
      !noveTekme.has(kljuc(f.round_number, f.home_team_id, f.away_team_id)) &&
      noveTekme.has(kljuc(f.round_number, f.away_team_id, f.home_team_id)))
    .map(f => f.round_number)
    .sort((a, b) => a - b)
}

/** Opozorilo za potrditveno okno, ali prazen niz, če zamenjav ni. */
export function opozoriloOZamenjavah(obstojece: Tekma[], nove: Tekma[]): string {
  const kola = zamenjaniDomacini(obstojece, nove)
  if (kola.length === 0) return ''
  const razlicna = [...new Set(kola)]
  return `POZOR: pri ${kola.length} ${kola.length === 1 ? 'tekmi' : 'tekmah'} ` +
    `(${razlicna.map(k => `${k}. kolo`).join(', ')}) je domačin ročno zamenjan. ` +
    'Regeneracija jih povozi in jih bo treba nastaviti znova.'
}
