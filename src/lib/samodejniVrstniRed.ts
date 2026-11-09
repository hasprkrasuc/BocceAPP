/**
 * Samodejni zapis končnega vrstnega reda državnega prvenstva.
 *
 * Kliče se po vsakem vpisu rezultata (Tournament.handleSaveScore). Dokler
 * prvenstvo ni odigrano do konca, ne naredi ničesar; po zadnji tekmi pa
 * izračuna uvrstitve (engines/vrstniRed) in jih zapiše v
 * `tournament_registrations.final_rank` — od tam jih bereta javni zavihek
 * »Končni vrstni red« in rang lestvica.
 *
 * Napaka pri zapisu ne sme podreti shranjevanja rezultata, zato se samo
 * zabeleži v konzolo.
 */

import { supabase } from '../supabase'
import {
  jePrvenstvoOdigrano, koncniVrstniRedPrvenstva,
  type TekmaVrstnegaReda, type SkupinaVrstnegaReda,
} from '../engines/vrstniRed'
import type { MatchStage } from '../types'

interface VrsticaTekme {
  stage: MatchStage
  match_number: number
  group_id: string | null
  team_a_id: string | null
  team_b_id: string | null
  winner_id: string | null
  score_a: number | null
  score_b: number | null
  is_bye: boolean
  status: string
}

function vTekmo(m: VrsticaTekme): TekmaVrstnegaReda {
  return {
    stage: m.stage, matchNumber: m.match_number,
    teamA: m.team_a_id, teamB: m.team_b_id, winner: m.winner_id,
    scoreA: m.score_a, scoreB: m.score_b, isBye: m.is_bye, status: m.status,
  }
}

export async function samodejnoZapisiVrstniRed(tournamentId: string): Promise<void> {
  try {
    const { data: t } = await supabase.from('tournaments')
      .select('kind, format').eq('id', tournamentId).single()
    if (!t || t.kind !== 'championship') return
    if (t.format !== 'groups' && t.format !== 'knockout') return

    const [{ data: matches }, { data: groups }] = await Promise.all([
      supabase.from('matches')
        .select('stage, match_number, group_id, team_a_id, team_b_id, winner_id, score_a, score_b, is_bye, status')
        .eq('tournament_id', tournamentId),
      supabase.from('tournament_groups').select('id, group_size').eq('tournament_id', tournamentId),
    ])
    const vse = (matches ?? []) as VrsticaTekme[]
    const izlocilne = vse.filter(m => !m.group_id && m.stage !== 'group').map(vTekmo)
    const skupine: SkupinaVrstnegaReda[] = (groups ?? []).map(g => ({
      velikost: g.group_size as number,
      tekme: vse.filter(m => m.group_id === g.id).map(vTekmo),
    }))

    if (!jePrvenstvoOdigrano(izlocilne, skupine)) return
    const mesta = koncniVrstniRedPrvenstva(izlocilne, skupine)
    if (mesta.size === 0) return

    // Ekipe v tekmah so group_teams idji (pri čistem izločilnem formatu pa
    // kar idji prijav) — preslikaj, kjer preslikava obstaja.
    const groupIds = (groups ?? []).map(g => g.id)
    let vPrijavo = new Map<string, string>()
    if (groupIds.length > 0) {
      const { data: gt } = await supabase.from('group_teams')
        .select('id, registration_id').in('group_id', groupIds)
      vPrijavo = new Map((gt ?? []).map(x => [x.id as string, x.registration_id as string]))
    }

    for (const [team, mesto] of mesta) {
      const regId = vPrijavo.get(team) ?? team
      const { error } = await supabase.from('tournament_registrations')
        .update({ final_rank: mesto }).eq('id', regId).eq('tournament_id', tournamentId)
      if (error) throw error
    }
  } catch (e) {
    console.warn('Samodejni zapis vrstnega reda ni uspel:', (e as Error).message)
  }
}
