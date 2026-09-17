import type { TournamentRegistration } from '../types'
import type { PrijavaIzbijanja } from '../components/IzbijanjeTabela'

/**
 * Prijava na turnir → vrstica grafikona izbijanja.
 *
 * Ime sestavi po istem pravilu kot seznam prijav: registriran igralec, sicer
 * gost, sicer prosto vpisano besedilo. Pri štafetnem izbijanju nastopata dva,
 * zato se drugi pripiše za poševnico — enako kot pri dvojicah.
 *
 * Klub vzame od prvega nastopajočega; pri štafeti sta oba iz istega kluba.
 */
export function imeIzbijanja(r: TournamentRegistration): PrijavaIzbijanja {
  const prvi = r.player1?.full_name ?? r.guest1?.full_name ?? r.player1_name ?? '—'
  const drugi = r.player2?.full_name ?? r.guest2?.full_name ?? r.player2_name ?? null
  return {
    id: r.id,
    draw_number: r.draw_number ?? null,
    ime: drugi ? `${prvi} / ${drugi}` : prvi,
    klub: r.player1?.club ?? r.guest1?.club ?? null,
  }
}
