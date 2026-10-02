/**
 * Ligaška lestvica.
 *
 * Razlika točk iger (`bouleDiff`) se NE izpisuje — na uvrstitev pa še vedno
 * vpliva: v `engines/league.ts` je tretje in četrto merilo razvrstitve. Če
 * kdaj izgine še iz motorja, se vrstni red tiho spremeni, zato je tam, ne tu.
 * Opomba pod tabelo merila našteva v celoti.
 *
 * KAZEN: `points` je že neto — motor odbitek odšteje, preden razvrsti. Tu ga
 * zato samo POKAŽEMO: zvezdica ob točkah in opomba pod tabelo z razlogom.
 * Svojega stolpca ne dobi namenoma; »+/- Igre« je šel ven prav zato, da je
 * lestvica na telefonu berljiva, kazni pa so redke.
 */
import { sl } from '../i18n/sl'
import type { TeamStats } from '../types'
import KlubskiGrb, { logoEkipe } from './KlubskiGrb'

interface Props {
  standings: TeamStats[]
  highlightTeamId?: string
}

export default function LeagueTable({ standings, highlightTeamId }: Props) {
  if (!standings || standings.length === 0) {
    return <p className="text-gray-400 italic text-center py-6">{sl.common.noData}</p>
  }

  const kaznovane = standings.filter(s => s.penaltyPoints > 0)

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
            <th className="px-3 py-3 text-center w-14 font-bold" title="Točke: zmaga 2 · remi 1 · poraz 0">Točke</th>
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
                  <span className="flex items-center gap-2">
                    <KlubskiGrb ime={row.team.club_name} logoUrl={logoEkipe(row.team)} velikost="md" />
                    <span className={isHighlighted ? 'text-bocce-green' : 'text-gray-800'}>{row.team.club_name}</span>
                    {row.team.short_name && <span className="text-xs text-gray-400">({row.team.short_name})</span>}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center text-gray-600">{row.played}</td>
                <td className="px-3 py-2.5 text-center text-green-700 font-medium">{row.won}</td>
                <td className="px-3 py-2.5 text-center text-gray-500">{row.drawn}</td>
                <td className="px-3 py-2.5 text-center text-red-500">{row.lost}</td>
                <td className="px-3 py-2.5 text-center text-gray-500 text-xs">{row.pointsFor}:{row.pointsAgainst}</td>
                <td className={`px-3 py-2.5 text-center font-bold text-base ${isTop3 ? 'text-bocce-green' : 'text-gray-700'}`}>
                  {row.points}
                  {row.penaltyPoints > 0 && (
                    <span className="text-red-500 text-xs font-semibold align-super ml-0.5"
                      title={`Kazen: −${row.penaltyPoints} ${row.penaltyPoints === 1 ? 'točka' : 'točke'}`}>
                      *
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {kaznovane.length > 0 && (
        <div className="px-3 py-2 border-t border-gray-100 bg-red-50/40">
          {kaznovane.map(k => (
            <p key={k.team.id} className="text-[11px] text-red-700 leading-relaxed">
              <span className="font-semibold">* {k.team.club_name}</span>
              {' '}−{k.penaltyPoints} {k.penaltyPoints === 1 ? 'točka' : 'točke'} (kazen)
              {k.team.penalty_note ? `: ${k.team.penalty_note}` : ''}
            </p>
          ))}
        </div>
      )}
      <p className="text-[11px] text-gray-400 px-3 py-2 border-t border-gray-100 leading-relaxed">
        Uvrstitev: 1) točke (zmaga 2 / remi 1 / poraz 0) · 2) medsebojni dvoboji · 3) razlika točk iger v medsebojnih · 4) skupna razlika točk iger.
        {kaznovane.length > 0 && ' Odbitek za kazen je že vštet v točke in vpliva na mesto.'}
      </p>
    </div>
  )
}
