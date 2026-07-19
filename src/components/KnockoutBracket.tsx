import { stageLabel, teamDisplayName } from '../engines/tournament'
import type { Match, TournamentRegistration, GroupTeam, MatchStage } from '../types'

const STAGES: MatchStage[] = ['r128', 'r64', 'r32', 'r16', 'qf', 'sf', 'final']

interface EnrichedMatch extends Match {
  teamA: (GroupTeam & { registration?: TournamentRegistration }) | null
  teamB: (GroupTeam & { registration?: TournamentRegistration }) | null
}

interface CardProps {
  match: EnrichedMatch
  isAdmin: boolean
  onEnterScore: (match: Match) => void
  highlight?: boolean
}

function KnockoutMatchCard({ match, isAdmin, onEnterScore, highlight = false }: CardProps) {
  const nameA = match.teamA ? teamDisplayName(match.teamA.registration, true) : '???'
  const nameB = match.teamB ? teamDisplayName(match.teamB.registration, true) : '???'
  const winnerIsA = match.winner_id && match.winner_id === match.team_a_id
  const winnerIsB = match.winner_id && match.winner_id === match.team_b_id

  return (
    <div className={`bg-white border rounded-lg overflow-hidden shadow-sm text-xs
      ${highlight ? 'border-bocce-gold/40' : 'border-gray-200'}`}>
      <div className="bg-gray-50 px-2 py-0.5 border-b border-gray-100">
        <span className="text-[10px] text-gray-500 font-medium">T{match.match_number}</span>
      </div>
      <div className={`flex items-center justify-between px-2 py-1 border-b border-gray-100 ${winnerIsA ? 'bg-green-50' : ''}`}>
        <span className={`flex-1 truncate ${winnerIsA ? 'font-semibold text-bocce-green' : 'text-gray-700'} ${!match.teamA ? 'text-gray-300 italic' : ''}`}>
          {match.teamA ? nameA : 'Čaka...'}
        </span>
        {match.score_a !== null && (
          <span className={`ml-2 w-5 text-center font-bold font-mono ${winnerIsA ? 'text-bocce-green' : 'text-gray-500'}`}>
            {match.score_a}
          </span>
        )}
      </div>
      <div className={`flex items-center justify-between px-2 py-1 ${winnerIsB ? 'bg-green-50' : ''}`}>
        <span className={`flex-1 truncate ${winnerIsB ? 'font-semibold text-bocce-green' : 'text-gray-700'} ${!match.teamB ? 'text-gray-300 italic' : ''}`}>
          {match.teamB ? nameB : (match.is_bye ? 'prosto (bye)' : 'Čaka...')}
        </span>
        {match.score_b !== null && (
          <span className={`ml-2 w-5 text-center font-bold font-mono ${winnerIsB ? 'text-bocce-green' : 'text-gray-500'}`}>
            {match.score_b}
          </span>
        )}
      </div>
      {isAdmin && match.team_a_id && match.team_b_id && !match.winner_id && (
        <button onClick={() => onEnterScore(match)}
          className="w-full text-[11px] bg-bocce-green text-white py-0.5 hover:bg-bocce-green-light transition-colors">
          Vnesi rezultat
        </button>
      )}
    </div>
  )
}

/** Ena stran (leva ali desna) mreže: stolpci krogov, tekme enakomerno razporejene. */
function BracketSide({ stages, byStage, side, isAdmin, onEnterScore }: {
  stages: MatchStage[]
  byStage: Record<string, EnrichedMatch[]>
  side: 'left' | 'right'
  isAdmin: boolean
  onEnterScore: (match: Match) => void
}) {
  // Desna stran: krogi v obratnem vrstnem redu (finale je na sredini).
  const cols = side === 'left' ? stages : [...stages].reverse()
  return (
    <>
      {cols.map(stage => {
        const all = (byStage[stage] ?? []).slice().sort((a, b) => a.match_number - b.match_number)
        const half = Math.ceil(all.length / 2)
        // Leva stran = prva polovica tekem kroga, desna = druga polovica.
        const matches = side === 'left' ? all.slice(0, half) : all.slice(half)
        if (matches.length === 0) return null
        return (
          <div key={`${side}-${stage}`} className="flex flex-col justify-around gap-3 min-w-[130px]"
               style={{ width: 140 }}>
            <h4 className="text-[11px] font-semibold text-gray-500 text-center border-b pb-1 mb-1">
              {stageLabel(stage)}
            </h4>
            <div className="flex-1 flex flex-col justify-around gap-3">
              {matches.map(m => (
                <KnockoutMatchCard key={m.id} match={m} isAdmin={isAdmin} onEnterScore={onEnterScore} />
              ))}
            </div>
          </div>
        )
      })}
    </>
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
  const stagesBeforeFinal = presentStages.filter(s => s !== 'final')
  const finalMatches = byStage['final'] ?? []
  const thirdPlace = byStage['third_place'] ?? []

  if (presentStages.length === 0) {
    return <div className="text-center py-12 text-gray-400 italic">Izločilni del še ni začet</div>
  }

  // Če je le finale (brez prejšnjih krogov), prikaži samo finale na sredini.
  const twoSided = stagesBeforeFinal.length > 0

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex items-stretch justify-center gap-4 min-w-max min-h-[240px]">
        {/* Leva veja */}
        {twoSided && (
          <BracketSide stages={stagesBeforeFinal} byStage={byStage} side="left"
            isAdmin={isAdmin} onEnterScore={onEnterScore} />
        )}

        {/* Sredina: finale (+ 3. mesto) */}
        <div className="flex flex-col justify-center items-center min-w-[180px]" style={{ width: 190 }}>
          {finalMatches.length > 0 && (
            <div className="w-full bg-gradient-to-b from-bocce-gold/10 to-bocce-gold/5 border border-bocce-gold/30 rounded-xl p-3">
              <h3 className="text-bocce-gold font-bold text-sm mb-2 text-center">🏆 Finale</h3>
              {finalMatches.map(m => (
                <KnockoutMatchCard key={m.id} match={m} isAdmin={isAdmin} onEnterScore={onEnterScore} highlight />
              ))}
              {thirdPlace.length > 0 && (
                <div className="mt-3 pt-3 border-t border-bocce-gold/20">
                  <h4 className="text-gray-500 font-medium text-[11px] mb-1 text-center">Za 3. mesto</h4>
                  {thirdPlace.map(m => (
                    <KnockoutMatchCard key={m.id} match={m} isAdmin={isAdmin} onEnterScore={onEnterScore} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Desna veja (zrcaljena) */}
        {twoSided && (
          <BracketSide stages={stagesBeforeFinal} byStage={byStage} side="right"
            isAdmin={isAdmin} onEnterScore={onEnterScore} />
        )}
      </div>
    </div>
  )
}
