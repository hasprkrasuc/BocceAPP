/**
 * Nalaganje vhodov za ligaški žreb v živo in zapis izida.
 *
 * Obred teče v celoti brez povezave: zaslon vse potrebno naloži ob odprtju
 * (`naloziLigaskiZreb`), sam žreb pa nato teče izključno v brskalniku brez
 * nadaljnjih klicev. Šele ob izrecni potrditvi uporabnika, po prikazu
 * predogleda (`spremembe`), se izid zapiše (`shraniLigaskiZreb`). Tako se
 * med obredom ne piše špekulativno v bazo, ki je v tem projektu produkcijska.
 */
import { supabase } from '../supabase'
import type { LeagueSeasonFormat } from '../types'
import type { LigaskoIzhodisce, Sprememba } from './zrebSpremembe'
export { spremembe, type Sprememba, type LigaskoIzhodisce } from './zrebSpremembe'

const VELJAVNI_FORMATI: readonly LeagueSeasonFormat[] = ['flat', 'groups', 'split']

/** Naloži vse, kar obred potrebuje. Po tem klicu zaslon ne bere več iz baze. */
export async function naloziLigaskiZreb(seasonId: string): Promise<LigaskoIzhodisce> {
  const { data: sezona, error: e1 } = await supabase
    .from('league_seasons')
    .select('id, name, format, double_round, berger_mirror')
    .eq('id', seasonId).single()
  if (e1 || !sezona) throw new Error('sezone ni mogoče naložiti')

  // Preveri format takoj ob nalaganju — nepričakovana vrednost naj pade tu, v
  // razumljivi slovenski napaki, ne šele globoko v pogonu žreba, kjer bi jo
  // bilo veliko težje razvozlati.
  if (!VELJAVNI_FORMATI.includes(sezona.format)) {
    throw new Error(
      `Sezona „${sezona.name}“ ima neznan format „${sezona.format}“ ` +
      `(pričakovano: ${VELJAVNI_FORMATI.join(', ')}).`,
    )
  }

  const { data: ekipeRaw, error: e2 } = await supabase
    .from('league_teams')
    .select('id, club_name, shared_venue_key')
    .eq('season_id', seasonId)
    .order('club_name')
  if (e2) throw new Error('ekip ni mogoče naložiti')

  const ekipe = (ekipeRaw ?? []).map(e => ({
    id: e.id, ime: e.club_name, shared_venue_key: e.shared_venue_key ?? null,
  }))

  return {
    nastavitve: {
      format: sezona.format,
      double_round: sezona.double_round,
      berger_mirror: sezona.berger_mirror,
    },
    ekipe,
    nosilniVrstniRed: [],
    imeSezone: sezona.name,
  }
}

/**
 * Zapiše izid. Kliče se šele ob izrecni potrditvi uporabnika, po predogledu.
 *
 * Piše vrstico za vrstico (ni skupinskega `upsert` stavka), ker Supabase
 * `update` ne zna v enem klicu nastaviti različnih vrednosti za različne
 * vrstice. Posledica: če zapis prekine napaka na pol poti, so nekatere ekipe
 * že zapisane, druge še ne — sezona ostane v vmesnem stanju, dokler
 * uporabnik obred ne ponovi (kar je varno: `update` je idempotenten, iste
 * vrstice le znova dobijo isto številko).
 */
export async function shraniLigaskiZreb(spremembe: Sprememba[]): Promise<void> {
  for (const s of spremembe) {
    const { error } = await supabase
      .from('league_teams')
      .update({ draw_number: s.draw_number, group_label: s.group_label })
      .eq('id', s.id)
    if (error) throw new Error(`zapis za ${s.ime} ni uspel: ${error.message}`)
  }
}
