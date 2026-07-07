import { sl } from '../i18n/sl'
import type { TeamStats } from '../types'

interface Props {
  standings: TeamStats[]
  highlightTeamId?: string
}

export default function LeagueTable({ standings, highlightTeamId }: Props) {
  if (!standings || standings.length === 0) {
    return <p className="text-gray-400 italic text-center py-6">{sl.common.noData}</p>
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-bocce-green text-white text-xs uppercase tracking-wide">
            <th className="px-3 py-3 text-left w-8">#</th>
            <th className="px-3 py-3 text-left">{sl.league.team}</th>
            <th className="px-3 py-3 text-center w-10" title={sl.league.played}>T</th>
            <th className="px-3 py-3 text-center w-10" title={sl.league.won}>Z</th>
            <th className="px-3 py-3 text-center w-10" title={sl.league.drawn}>N</th>
            <th className="px-3 py-3 text-center w-10" title={sl.league.lost}>P</th>
            <th className="px-3 py-3 text-center w-16" title="Match točke za / proti (seštevek končnih izidov tekem)">T+/T-</th>
            <th className="px-3 py-3 text-center w-14" title="Razlika točk posameznih iger (boule) — tiebreak">Igre ±</th>
            <th className="px-3 py-3 text-center w-14 font-bold" title="Uvrstitev: seštevek osvojenih match točk">Točke</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row, i) => {
            const isHighlighted = row.team.id === highlightTeamId
            const isTop3 = i < 3
            return (
              <tr key={row.team.id}
                className={`border-b border-gray-100 transition-colors hover:bg-bocce-green/5
                  ${isHighlighted ? 'bg-bocce-green/5 font-semibold' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                <td className="px-3 py-2.5 text-center">
                  {i === 0 && <span title="1. mesto">🥇</span>}
                  {i === 1 && <span title="2. mesto">🥈</span>}
                  {i === 2 && <span title="3. mesto">🥉</span>}
                  {i >= 3 && <span className="text-gray-400">{i + 1}</span>}
                </td>
                <td className="px-3 py-2.5">
                  <span className={isHighlighted ? 'text-bocce-green' : 'text-gray-800'}>{row.team.club_name}</span>
                  {row.team.short_name && <span className="ml-2 text-xs text-gray-400">({row.team.short_name})</span>}
                </td>
                <td className="px-3 py-2.5 text-center text-gray-600">{row.played}</td>
                <td className="px-3 py-2.5 text-center text-green-700 font-medium">{row.won}</td>
                <td className="px-3 py-2.5 text-center text-gray-500">{row.drawn}</td>
                <td className="px-3 py-2.5 text-center text-red-500">{row.lost}</td>
                <td className="px-3 py-2.5 text-center text-gray-500 text-xs">{row.pointsFor}:{row.pointsAgainst}</td>
                <td className={`px-3 py-2.5 text-center font-mono text-xs
                  ${row.bouleDiff > 0 ? 'text-green-600' : row.bouleDiff < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                  {row.bouleDiff > 0 ? '+' : ''}{row.bouleDiff}
                </td>
                <td className={`px-3 py-2.5 text-center font-bold text-base ${isTop3 ? 'text-bocce-green' : 'text-gray-700'}`}>
                  {row.points}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-[11px] text-gray-400 px-3 py-2 border-t border-gray-100 leading-relaxed">
        Uvrstitev: 1) seštevek osvojenih match točk · 2) medsebojni dvoboji · 3) razlika točk iger v medsebojnih · 4) skupna razlika točk iger.
      </p>
    </div>
  )
}
