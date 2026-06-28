import { useMemo, useState } from 'react'
import type {
  LeagueFixture, LeagueMatchResult, LeagueMatchDisciplineResult,
  LeagueSeasonDiscipline, LeagueTeam,
} from '../types'
import { aggregatePlayerStats, calculateRang } from '../engines/leagueStats'
import { playersByDiscipline, teamsByDiscipline, showsAverage } from '../engines/leagueStatsViews'
import type { ResolvedPlayer } from '../lib/playerNames'

type MR = Array<LeagueMatchResult & { discipline_results?: LeagueMatchDisciplineResult[] }>

interface BaseProps {
  fixtures: LeagueFixture[]
  matchResults: MR
  disciplines: LeagueSeasonDiscipline[]
  teams: LeagueTeam[]
  names: Map<string, ResolvedPlayer>
}

const nameOf = (names: Map<string, ResolvedPlayer>, id: string) => names.get(id)?.full_name ?? id
const clubOf = (names: Map<string, ResolvedPlayer>, id: string) => names.get(id)?.club ?? ''

// ── Statistika (3 podpogledi) ────────────────────────────────────────────────
export function LeagueStatsPanel({ fixtures, matchResults, disciplines, teams, names }: BaseProps) {
  const [view, setView] = useState<'player' | 'playerDisc' | 'teamDisc'>('player')

  const playerStats = useMemo(
    () => aggregatePlayerStats(matchResults, fixtures, disciplines),
    [matchResults, fixtures, disciplines],
  )
  const playerSections = useMemo(
    () => playersByDiscipline(playerStats, disciplines),
    [playerStats, disciplines],
  )
  const teamSections = useMemo(
    () => teamsByDiscipline(teams.map(t => t.id), fixtures, matchResults, disciplines),
    [teams, fixtures, matchResults, disciplines],
  )
  const teamName = useMemo(
    () => Object.fromEntries(teams.map(t => [t.id, t.club_name])) as Record<string, string>,
    [teams],
  )

  const TABS: { key: typeof view; label: string }[] = [
    { key: 'player', label: 'Posameznik' },
    { key: 'playerDisc', label: 'Po disciplinah' },
    { key: 'teamDisc', label: 'Ekipno' },
  ]

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setView(t.key)}
            className={`text-sm px-3 py-1.5 rounded-lg border ${view === t.key ? 'bg-bocce-green text-white border-bocce-green' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {view === 'player' && (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b">
            <th className="py-1 w-8">#</th><th>Igralec</th><th>Klub</th>
            <th className="text-right">Odigrano</th><th className="text-right">Točke</th>
          </tr></thead>
          <tbody>
            {playerStats.map((p, i) => (
              <tr key={p.playerId} className="border-b">
                <td className="py-1">{i + 1}</td>
                <td>{nameOf(names, p.playerId)}</td>
                <td className="text-gray-500">{clubOf(names, p.playerId)}</td>
                <td className="text-right">{p.totalPlayed}</td>
                <td className="text-right font-semibold">{p.totalMatchPointsFor}</td>
              </tr>
            ))}
            {playerStats.length === 0 && <tr><td colSpan={5} className="py-2 text-gray-400">Ni podatkov.</td></tr>}
          </tbody>
        </table>
      )}

      {view === 'playerDisc' && (
        <div className="space-y-6">
          {playerSections.filter(s => s.rows.length > 0).map(({ discipline, rows }) => (
            <div key={discipline.id}>
              <h3 className="text-sm font-bold text-gray-700 mb-2">{discipline.name}</h3>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-gray-500 border-b">
                  <th className="py-1">Igralec</th><th className="text-right">Odigrano</th>
                  <th className="text-right">Točke</th>
                  {showsAverage(discipline.discipline_type) && <th className="text-right">Povprečje</th>}
                </tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.playerId} className="border-b">
                      <td className="py-1">{nameOf(names, r.playerId)}</td>
                      <td className="text-right">{r.played}</td>
                      <td className="text-right font-semibold">{r.matchPointsFor}</td>
                      {showsAverage(discipline.discipline_type) && <td className="text-right">{r.average.toFixed(1)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {playerSections.every(s => s.rows.length === 0) && <p className="text-sm text-gray-400">Ni podatkov.</p>}
        </div>
      )}

      {view === 'teamDisc' && (
        <div className="space-y-6">
          {teamSections.filter(s => s.rows.length > 0).map(({ discipline, rows }) => (
            <div key={discipline.id}>
              <h3 className="text-sm font-bold text-gray-700 mb-2">{discipline.name}</h3>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-gray-500 border-b">
                  <th className="py-1">Ekipa</th><th className="text-right">Odigrano</th>
                  <th className="text-right">Točke</th>
                  {showsAverage(discipline.discipline_type) && <th className="text-right">Povprečje</th>}
                </tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.teamId} className="border-b">
                      <td className="py-1">{teamName[r.teamId] ?? r.teamId}</td>
                      <td className="text-right">{r.played}</td>
                      <td className="text-right font-semibold">{r.matchPointsFor}</td>
                      {showsAverage(discipline.discipline_type) && <td className="text-right">{r.average.toFixed(1)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {teamSections.every(s => s.rows.length === 0) && <p className="text-sm text-gray-400">Ni podatkov.</p>}
        </div>
      )}
    </div>
  )
}

// ── Rang (utežena lestvica te lige) ──────────────────────────────────────────
export function LeagueRangPanel({ fixtures, matchResults, disciplines, names, tier }: BaseProps & { tier: string }) {
  const ranking = useMemo(() => {
    const ps = aggregatePlayerStats(matchResults, fixtures, disciplines)
    return ps.map(p => calculateRang(p, tier))
      .filter(r => !!names.get(r.playerId)?.club)   // odstrani tekmovalce brez kluba
      .sort((a, b) => b.rang - a.rang)
  }, [matchResults, fixtures, disciplines, tier, names])

  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-gray-500 border-b">
        <th className="py-1 w-8">#</th><th>Igralec</th><th>Klub</th><th className="text-right">Rang</th>
      </tr></thead>
      <tbody>
        {ranking.map((r, i) => (
          <tr key={r.playerId} className="border-b">
            <td className="py-1">{i + 1}</td>
            <td>{nameOf(names, r.playerId)}</td>
            <td className="text-gray-500">{clubOf(names, r.playerId)}</td>
            <td className="text-right font-semibold">{r.rang.toFixed(2)}</td>
          </tr>
        ))}
        {ranking.length === 0 && <tr><td colSpan={4} className="py-2 text-gray-400">Ni podatkov.</td></tr>}
      </tbody>
    </table>
  )
}
