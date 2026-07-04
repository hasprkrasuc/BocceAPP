import { stageLabel, teamDisplayName } from '../engines/tournament'
import type { Match, TournamentRegistration, GroupTeam, MatchStage } from '../types'

const STAGES: MatchStage[] = ['r128', 'r64', 'r32', 'r16', 'qf', 'sf', 'final']
const STAGE_WIDTHS: Partial<Record<MatchStage | 'third_place', number>> = {
  r128: 132, r64: 132, r32: 136, r16: 140, qf: 148, sf: 156, final: 164, third_place: 156,
}

interface EnrichedMatch extends Match {
  teamA: (GroupTeam & { registration?: TournamentRegistration }) | null
  teamB: (GroupTeam & { registration?: TournamentRegistration }) | null
}

interface CardProps {
  match: EnrichedMatch
  isAdmin: boolean
  onEnterScore: (match: Match) => void
  compact?: boolean
}

function KnockoutMatchCard({ match, isAdmin, onEnterScore, compact = false }: CardProps) {
  const nameA = match.teamA ? teamDisplayName(match.teamA.registration) : '???'
  const nameB = match.teamB ? teamDisplayName(match.teamB.registration) : '???'
  const winnerIsA = match.winner_id && match.winner_id === match.team_a_id
  const winnerIsB = match.winner_id && match.winner_id === match.team_b_id

  return (
    <div className={`bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm ${compact ? 'text-xs' : 'text-sm'}`}>
      <div className="bg-gray-50 px-2 py-1 border-b border-gray-100">
        <span className="text-xs text-gray-500 font-medium">T{match.match_number}</span>
      </div>
      <div className={`flex items-center justify-between px-3 py-1.5 border-b border-gray-100 ${winnerIsA ? 'bg-green-50' : ''}`}>
        <span className={`flex-1 truncate ${winnerIsA ? 'font-semibold text-bocce-green' : 'text-gray-700'} ${!match.teamA ? 'text-gray-300 italic' : ''}`}>
          {match.teamA ? nameA : 'Čaka...'}
        </span>
        {match.score_a !== null && (
          <span className={`ml-2 w-6 text-center font-bold font-mono rounded ${winnerIsA ? 'text-bocce-green' : 'text-gray-500'}`}>
            {match.score_a}
          </span>
        )}
      </div>
      <div className={`flex items-center justify-between px-3 py-1.5 ${winnerIsB ? 'bg-green-50' : ''}`}>
        <span className={`flex-1 truncate ${winnerIsB ? 'font-semibold text-bocce-green' : 'text-gray-700'} ${!match.teamB ? 'text-gray-300 italic' : ''}`}>
          {match.teamB ? nameB : (match.is_bye ? 'prosto (bye)' : 'Čaka...')}
        </span>
        {match.score_b !== null && (
          <span className={`ml-2 w-6 text-center font-bold font-mono rounded ${winnerIsB ? 'text-bocce-green' : 'text-gray-500'}`}>
            {match.score_b}
          </span>
        )}
      </div>
      {isAdmin && match.team_a_id && match.team_b_id && !match.winner_id && (
        <button onClick={() => onEnterScore(match)}
          className="w-full text-xs bg-bocce-green text-white py-1 hover:bg-bocce-green-light transition-colors">
          Vnesi rezultat
        </button>
      )}
    </div>
  )
}

interface Props {
  matches: Match[]
  registrations: TournamentRegistration[]
  isAdmin: boolean
  onEnterScore: (match: Match) => void
}

export default function KnockoutBracket({ matches, registrations, isAdmin, onEnterScore }: Props) {
  const regMap: Record<string, TournamentRegistration> = {}
  for (const reg of registrations) regMap[reg.id] = reg

  const enrich = (m: Match): EnrichedMatch => ({
    ...m,
    teamA: m.team_a ? { ...m.team_a, registration: regMap[m.team_a.registration_id] } : null,
    teamB: m.team_b ? { ...m.team_b, registration: regMap[m.team_b.registration_id] } : null,
  })

  const byStage: Record<string, EnrichedMatch[]> = {}
  for (const m of matches ?? []) {
    if (!byStage[m.stage]) byStage[m.stage] = []
    byStage[m.stage].push(enrich(m))
  }

  const presentStages = STAGES.filter(s => byStage[s]?.length > 0)
  const hasThirdPlace = byStage['third_place']?.length > 0

  if (presentStages.length === 0) {
    return <div className="text-center py-12 text-gray-400 italic">Izločilni del še ni začet</div>
  }

  return (
    <div>
      {byStage['final'] && (
        <div className="mb-6 bg-gradient-to-r from-bocce-gold/10 to-bocce-gold/5 border border-bocce-gold/30 rounded-xl p-4">
          <h3 className="text-bocce-gold font-bold text-lg mb-3 text-center">🏆 Finale</h3>
          <div className="max-w-sm mx-auto">
            {byStage['final'].map(m => (
              <KnockoutMatchCard key={m.id} match={m} isAdmin={isAdmin} onEnterScore={onEnterScore} />
            ))}
          </div>
          {hasThirdPlace && (
            <div className="mt-4 pt-4 border-t border-bocce-gold/20">
              <h4 className="text-gray-500 font-medium text-sm mb-2 text-center">Tekma za 3. mesto</h4>
              <div className="max-w-sm mx-auto">
                {byStage['third_place'].map(m => (
                  <KnockoutMatchCard key={m.id} match={m} isAdmin={isAdmin} onEnterScore={onEnterScore} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="flex gap-6 min-w-max pb-4">
          {presentStages.filter(s => s !== 'final').map(stage => (
            <div key={stage} style={{ width: STAGE_WIDTHS[stage] ?? 150 }}>
              <h4 className="text-sm font-semibold text-gray-600 mb-3 text-center border-b pb-2">
                {stageLabel(stage)}
              </h4>
              <div className="space-y-3">
                {(byStage[stage] ?? [])
                  .sort((a, b) => a.match_number - b.match_number)
                  .map(m => (
                    <KnockoutMatchCard key={m.id} match={m} isAdmin={isAdmin} onEnterScore={onEnterScore} compact />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
