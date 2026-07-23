import { useState } from 'react'
import { supabase } from '../supabase'
import LaneInput from './LaneInput'
import { matchTypeLabel, teamDisplayName } from '../engines/tournament'
import type { TournamentGroup, Match, TournamentRegistration, GroupTeam, MatchType } from '../types'

export interface JudgeOption { id: string; full_name: string | null }

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
  judgeName?: string | null
}

function MatchRow({ match, onEnterScore, isAdmin, judgeName }: MatchRowProps) {
  const nameA = match.teamA ? teamDisplayName(match.teamA.registration, true) : (match.is_bye ? '—' : '???')
  const nameB = match.is_bye ? 'Prosta' : (match.teamB ? teamDisplayName(match.teamB.registration, true) : '???')
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
          <span className="text-sm break-words leading-tight flex-1">{nameA}</span>
          <ScoreBadge score={match.score_a} isWinner={!!winnerIsA} />
        </div>
        <div className={`flex items-center justify-between gap-2 px-2 py-1 rounded ${winnerIsB ? 'bg-white/70 font-semibold' : ''} ${match.is_bye ? 'text-gray-400' : ''}`}>
          <span className="text-sm break-words leading-tight flex-1">{nameB}</span>
          <ScoreBadge score={match.is_bye ? 0 : match.score_b} isWinner={!!winnerIsB} />
        </div>
      </div>

      {!match.is_bye && (isAdmin || match.lane_number || judgeName) && (
        <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-2 text-xs text-gray-500">
          {isAdmin ? (
            <span className="flex items-center gap-1.5">
              Steza:
              <LaneInput matchId={match.id} initial={match.lane_number ?? ''} />
            </span>
          ) : match.lane_number ? (
            <span>Steza {match.lane_number}</span>
          ) : null}
          {judgeName && <span>{(isAdmin || match.lane_number) ? '· ' : ''}Sodnik: {judgeName}</span>}
        </div>
      )}

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
  judges?: JudgeOption[]
}

export default function GroupBracket({ group, matches, registrations, isAdmin, onEnterScore, judges = [] }: Props) {
  const [venue, setVenue] = useState(group.venue_name ?? '')
  const [judgeId, setJudgeId] = useState(group.judge_id ?? '')
  const [venueSaved, setVenueSaved] = useState(false)
  const [judgeSaved, setJudgeSaved] = useState(false)
  const saveVenue = async () => {
    const { error } = await supabase.from('tournament_groups').update({ venue_name: venue.trim() || null }).eq('id', group.id)
    if (!error) { setVenueSaved(true); setTimeout(() => setVenueSaved(false), 1500) }
  }
  const saveJudge = async (v: string) => {
    setJudgeId(v)
    const { error } = await supabase.from('tournament_groups').update({ judge_id: v || null }).eq('id', group.id)
    if (!error) { setJudgeSaved(true); setTimeout(() => setJudgeSaved(false), 1500) }
  }
  const judgeName = judges.find(j => j.id === group.judge_id)?.full_name ?? null

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
          {venue && <span className="text-green-200 text-sm ml-2">— {venue}</span>}
        </h3>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium
          ${group.status === 'completed' ? 'bg-bocce-gold text-white' : 'bg-green-700 text-green-100'}`}>
          {group.status === 'completed' ? 'Zaključena' : 'V teku'}
        </span>
      </div>

      {/* Lokacija + sodnik skupine */}
      {isAdmin ? (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center gap-2">
          <span className="flex-1 min-w-[130px] flex items-center gap-1">
            <input value={venue} onChange={e => setVenue(e.target.value)} onBlur={saveVenue}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
              placeholder="Lokacija (prostoročno)"
              className="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1 text-xs bg-white" />
            {venueSaved && <span className="text-green-600 text-[11px] font-medium">✓</span>}
          </span>
          <span className="flex items-center gap-1 max-w-[45%]">
            <select value={judgeId} onChange={e => saveJudge(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-xs bg-white min-w-0">
              <option value="">— Sodnik —</option>
              {judges.map(j => <option key={j.id} value={j.id}>{j.full_name}</option>)}
            </select>
            {judgeSaved && <span className="text-green-600 text-[11px] font-medium">✓</span>}
          </span>
        </div>
      ) : judgeName ? (
        <div className="px-4 py-1.5 bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
          Sodnik: {judgeName}
        </div>
      ) : null}

      <div className="p-4">
        {groupMatches.length === 0 ? (
          <p className="text-gray-400 text-sm italic text-center py-4">Žreb še ni opravljen</p>
        ) : (
          groupMatches.map(m => (
            <MatchRow key={m.id} match={m} isAdmin={isAdmin} onEnterScore={onEnterScore} judgeName={judgeName} />
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
                <span className="text-sm font-medium">{teamDisplayName(qualifiers[1].registration, true)}</span>
              </div>
            )}
            {qualifiers[2] && (
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-gray-400 text-white text-xs font-bold flex items-center justify-center">2</span>
                <span className="text-sm font-medium">{teamDisplayName(qualifiers[2].registration, true)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
