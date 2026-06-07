import { matchTypeLabel, teamDisplayName } from '../engines/tournament'
import type { TournamentGroup, Match, TournamentRegistration, GroupTeam, MatchType } from '../types'

const TYPE_COLORS: Record<MatchType, string> = {
  zm:      'bg-green-50 border-green-300 text-green-800',
  po:      'bg-orange-50 border-orange-300 text-orange-800',
  r:       'bg-purple-50 border-purple-300 text-purple-800',
  bye:     'bg-gray-50 border-gray-200 text-gray-500',
  knockout:'bg-blue-50 border-blue-300 text-blue-800',
}

const TYPE_BADGE: Record<MatchType, string> = {
  zm:      'bg-green-100 text-green-700',
  po:      'bg-orange-100 text-orange-700',
  r:       'bg-purple-100 text-purple-700',
  bye:     'bg-gray-100 text-gray-500',
  knockout:'bg-blue-100 text-blue-700',
}

interface EnrichedMatch extends Match {
  teamA: (GroupTeam & { registration?: TournamentRegistration }) | null
  teamB: (GroupTeam & { registration?: TournamentRegistration }) | null
  winner: (GroupTeam & { registration?: TournamentRegistration }) | null
}

interface ScoreBadgeProps { score: number | null; isWinner: boolean }

function ScoreBadge({ score, isWinner }: ScoreBadgeProps) {
  if (score === null || score === undefined) return (
    <span className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 text-gray-400 text-sm font-mono">–</span>
  )
  return (
    <span className={`w-8 h-8 flex items-center justify-center rounded text-sm font-bold font-mono
      ${isWinner ? 'bg-bocce-green text-white' : 'bg-gray-100 text-gray-600'}`}>
      {score}
    </span>
  )
}

interface MatchRowProps {
  match: EnrichedMatch
  onEnterScore: (match: Match) => void
  isAdmin: boolean
}

function MatchRow({ match, onEnterScore, isAdmin }: MatchRowProps) {
  const nameA = match.teamA ? teamDisplayName(match.teamA.registration) : (match.is_bye ? '—' : '???')
  const nameB = match.is_bye ? 'Prosta' : (match.teamB ? teamDisplayName(match.teamB.registration) : '???')
  const winnerIsA = match.winner && match.winner.id === match.team_a_id
  const winnerIsB = match.winner && match.winner.id === match.team_b_id
  const colors = TYPE_COLORS[match.match_type] ?? TYPE_COLORS.zm

  return (
    <div className={`border rounded-lg p-3 mb-2 ${colors} ${match.is_bye ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${TYPE_BADGE[match.match_type]}`}>
          T{match.match_number} · {matchTypeLabel(match.match_type)}
        </span>
        {match.is_bye && <span className="text-xs text-gray-400 italic">prosta</span>}
      </div>

      <div className="space-y-1">
        <div className={`flex items-center justify-between gap-2 px-2 py-1 rounded ${winnerIsA ? 'bg-white/70 font-semibold' : ''}`}>
          <span className="text-sm truncate flex-1">{nameA}</span>
          <ScoreBadge score={match.score_a} isWinner={!!winnerIsA} />
        </div>
        <div className={`flex items-center justify-between gap-2 px-2 py-1 rounded ${winnerIsB ? 'bg-white/70 font-semibold' : ''} ${match.is_bye ? 'text-gray-400' : ''}`}>
          <span className="text-sm truncate flex-1">{nameB}</span>
          <ScoreBadge score={match.is_bye ? 0 : match.score_b} isWinner={!!winnerIsB} />
        </div>
      </div>

      {isAdmin && !match.is_bye && match.team_a_id && match.team_b_id && (
        <button onClick={() => onEnterScore(match)}
          className={`mt-2 w-full text-xs py-1 rounded transition-colors
            ${match.winner_id
              ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              : 'bg-bocce-green text-white hover:bg-bocce-green-light'}`}>
          {match.winner_id ? '✎ Popravi rezultat' : 'Vnesi rezultat'}
        </button>
      )}
    </div>
  )
}

interface Props {
  group: TournamentGroup
  matches: Match[]
  registrations: TournamentRegistration[]
  isAdmin: boolean
  onEnterScore: (match: Match) => void
}

export default function GroupBracket({ group, matches, registrations, isAdmin, onEnterScore }: Props) {
  const regMap: Record<string, TournamentRegistration> = {}
  for (const reg of registrations) regMap[reg.id] = reg

  const enrichedMatches: EnrichedMatch[] = (matches ?? []).map(m => ({
    ...m,
    teamA: m.team_a ? { ...m.team_a, registration: regMap[m.team_a.registration_id] } : null,
    teamB: m.team_b ? { ...m.team_b, registration: regMap[m.team_b.registration_id] } : null,
    winner: m.winner_id
      ? (m.team_a_id === m.winner_id
          ? { ...m.team_a!, registration: regMap[m.team_a?.registration_id ?? ''] }
          : { ...m.team_b!, registration: regMap[m.team_b?.registration_id ?? ''] })
      : null,
  }))

  const groupMatches = enrichedMatches
    .filter(m => m.group_id === group.id)
    .sort((a, b) => a.match_number - b.match_number)

  // 1st qualifier = winner of last zm match; 2nd = winner of last r match
  const lastZm = groupMatches.filter(m => m.match_type === 'zm').at(-1)
  const lastR  = groupMatches.filter(m => m.match_type === 'r').at(-1)
  const qualifiers = {
    1: lastZm?.winner_id ? lastZm.winner : null,
    2: lastR?.winner_id  ? lastR.winner  : null,
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="bg-bocce-green px-4 py-3 flex items-center justify-between">
        <h3 className="text-white font-semibold">
          Skupina {group.group_number}
          {group.venue_name && <span className="text-green-200 text-sm ml-2">— {group.venue_name}</span>}
        </h3>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium
          ${group.status === 'completed' ? 'bg-bocce-gold text-white' : 'bg-green-700 text-green-100'}`}>
          {group.status === 'completed' ? 'Zaključena' : 'V teku'}
        </span>
      </div>

      <div className="p-4">
        {groupMatches.length === 0 ? (
          <p className="text-gray-400 text-sm italic text-center py-4">Žreb še ni opravljen</p>
        ) : (
          groupMatches.map(m => (
            <MatchRow key={m.id} match={m} isAdmin={isAdmin} onEnterScore={onEnterScore} />
          ))
        )}
      </div>

      {(qualifiers[1] || qualifiers[2]) && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Napredujeta</p>
          <div className="space-y-1">
            {qualifiers[1] && (
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-bocce-gold text-white text-xs font-bold flex items-center justify-center">1</span>
                <span className="text-sm font-medium">{teamDisplayName(qualifiers[1].registration)}</span>
              </div>
            )}
            {qualifiers[2] && (
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-gray-400 text-white text-xs font-bold flex items-center justify-center">2</span>
                <span className="text-sm font-medium">{teamDisplayName(qualifiers[2].registration)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
