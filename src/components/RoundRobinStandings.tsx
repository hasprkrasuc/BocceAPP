import { teamDisplayName } from '../engines/tournament'
import { roundRobinStandings } from '../engines/roundRobin'
import type { Match, TournamentRegistration } from '../types'

interface Props {
  matches: Match[]
  registrations: TournamentRegistration[]
  isAdmin: boolean
  onEnterScore: (match: Match) => void
}

export default function RoundRobinStandings({ matches, registrations, isAdmin, onEnterScore }: Props) {
  const regMap: Record<string, TournamentRegistration> = {}
  for (const reg of registrations) regMap[reg.id] = reg

  // group_team id -> registracija (iz vpetih team_a/team_b)
  const teamReg: Record<string, TournamentRegistration | undefined> = {}
  for (const m of matches) {
    if (m.team_a) teamReg[m.team_a.id] = regMap[m.team_a.registration_id]
    if (m.team_b) teamReg[m.team_b.id] = regMap[m.team_b.registration_id]
  }
  const nameOf = (teamId: string | null) => teamId ? teamDisplayName(teamReg[teamId]) : '—'

  const standings = roundRobinStandings(matches)
  const played = [...matches].sort((a, b) => a.match_number - b.match_number)

  return (
    <div className="space-y-6">
      {/* Lestvica */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-bocce-green px-4 py-3">
          <h3 className="text-white font-semibold">Lestvica</h3>
          <p className="text-green-200 text-xs">Krožni sistem — zmaga 2, remi 1, poraz 0</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wide border-b border-gray-100">
                <th className="text-left font-semibold px-3 py-2 w-8">#</th>
                <th className="text-left font-semibold px-3 py-2">Igralec / ekipa</th>
                <th className="text-center font-semibold px-2 py-2" title="Odigrane">Odi</th>
                <th className="text-center font-semibold px-2 py-2" title="Zmage">Z</th>
                <th className="text-center font-semibold px-2 py-2" title="Remiji">R</th>
                <th className="text-center font-semibold px-2 py-2" title="Porazi">P</th>
                <th className="text-center font-semibold px-2 py-2" title="Doseženi : prejeti">Točke igre</th>
                <th className="text-center font-semibold px-3 py-2">Točke</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.teamId} className={`border-b border-gray-50 ${i < 4 ? 'bg-green-50/40' : ''}`}>
                  <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-800">{nameOf(s.teamId)}</td>
                  <td className="px-2 py-2 text-center text-gray-600">{s.played}</td>
                  <td className="px-2 py-2 text-center text-gray-600">{s.wins}</td>
                  <td className="px-2 py-2 text-center text-gray-600">{s.draws}</td>
                  <td className="px-2 py-2 text-center text-gray-600">{s.losses}</td>
                  <td className="px-2 py-2 text-center text-gray-500 font-mono text-xs">{s.scoreFor}:{s.scoreAgainst}</td>
                  <td className="px-3 py-2 text-center font-bold text-bocce-green">{s.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tekme */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-100 px-4 py-3">
          <h3 className="font-semibold text-gray-700">Tekme ({played.length})</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {played.map(m => {
            const aWins = m.winner_id && m.winner_id === m.team_a_id
            const bWins = m.winner_id && m.winner_id === m.team_b_id
            return (
              <div key={m.id} className="px-4 py-2 flex items-center gap-2 text-sm">
                <span className={`flex-1 text-right truncate ${aWins ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{nameOf(m.team_a_id)}</span>
                <span className="font-mono text-gray-800 whitespace-nowrap px-2">
                  {m.score_a ?? '–'} : {m.score_b ?? '–'}
                </span>
                <span className={`flex-1 truncate ${bWins ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{nameOf(m.team_b_id)}</span>
                {isAdmin && (
                  <button onClick={() => onEnterScore(m)}
                    className="text-xs text-gray-400 hover:text-bocce-green px-1" title="Popravi rezultat">✎</button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
