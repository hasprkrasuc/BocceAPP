/**
 * RANG LESTVICA — stran (liga + državna prvenstva, zadnjih 365 dni).
 * Izračun je v lib/rangLestvica.ts (deljen s stranjo igralca).
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LIGA_KOEF, DEFAULT_LIGA_KOEF } from '../engines/leagueStats'
import {
  computeRangLestvica, TIER_LABELS, RANG_CATEGORIES, RANG_CATEGORY_LABELS,
  type RangRow, type RangCategory,
} from '../lib/rangLestvica'

const EMPTY_BY_CAT: Record<RangCategory, RangRow[]> = { men: [], women: [], u18: [], u18_women: [], u14: [] }

export function LeagueRanking() {
  const [byCategory, setByCategory]   = useState<Record<RangCategory, RangRow[]>>(EMPTY_BY_CAT)
  const [cat, setCat]                 = useState<RangCategory>('men')
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [expanded, setExpanded]       = useState<string | null>(null)
  const [cutoffLabel, setCutoffLabel] = useState<string>('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const { byCategory, cutoffLabel } = await computeRangLestvica()
      setCutoffLabel(cutoffLabel)
      setByCategory(byCategory)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Napaka pri nalaganju')
    } finally {
      setLoading(false)
    }
  }

  const toggleExpand = (id: string) => setExpanded(prev => prev === id ? null : id)
  const rows = byCategory[cat]

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Rang lestvica</h1>
        <p className="text-sm text-gray-500 mt-1">
          Ligaški rang + državna prvenstva
          {cutoffLabel && (
            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 bg-bocce-green/10 text-bocce-green rounded-full text-xs font-medium">
              📅 {cutoffLabel}
            </span>
          )}
        </p>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {RANG_CATEGORIES.map(c => (
          <button key={c} onClick={() => { setCat(c); setExpanded(null) }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              cat === c ? 'bg-bocce-green text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {RANG_CATEGORY_LABELS[c]}
            <span className="ml-1.5 text-xs opacity-70">{byCategory[c].length}</span>
          </button>
        ))}
      </div>

      {/* Formula legend */}
      <div className="bg-bocce-green/5 border border-bocce-green/20 rounded-xl px-4 py-3 mb-6 text-xs text-gray-600 space-y-2">
        <div>
          <span className="font-semibold text-gray-700">Liga:</span>
          {' '}rang = utežene točke × koef. lige × % uspešnosti
          <span className="ml-3 text-gray-500">
            (Posamezno/krog 100 % · Dvojka 75 % · Ostalo 50 %)
          </span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {Object.entries(LIGA_KOEF).map(([k, v]) => (
            <span key={k}><strong>{TIER_LABELS[k] ?? k}:</strong> {v}</span>
          ))}
          <span><strong>Ostale:</strong> {DEFAULT_LIGA_KOEF}</span>
        </div>
        <div>
          <span className="font-semibold text-gray-700">Državna prvenstva:</span>
          <span className="ml-2 text-gray-500">
            1. m. 16 · 2. m. 10 · 3. m. 8 · 4. m. 7 · 5.–8. m. 3 · 9.–16. m. 1
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5,6,7,8].map(i => (
            <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-gray-400 italic">
          Ni podatkov za rang lestvico
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-bocce-green text-white text-xs uppercase tracking-wide">
                <th className="px-3 py-3 text-left w-8">#</th>
                <th className="px-3 py-3 text-left">Igralec</th>
                <th className="px-3 py-3 text-left hidden sm:table-cell">Klub</th>
                <th className="px-3 py-3 text-right hidden md:table-cell" title="Liga odigrane discipline">Odigr.</th>
                <th className="px-3 py-3 text-right hidden md:table-cell" title="% uspešnosti v ligah">% usp.</th>
                <th className="px-3 py-3 text-right" title="Liga rang">Liga</th>
                <th className="px-3 py-3 text-right" title="DP točke">DP</th>
                <th className="px-3 py-3 text-right font-bold" title="Skupni rang">Rang</th>
                <th className="px-3 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <>
                  <tr
                    key={row.playerId}
                    className={`border-b border-gray-100 hover:bg-bocce-green/5 transition-colors cursor-pointer ${
                      i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                    }`}
                    onClick={() => toggleExpand(row.playerId)}
                  >
                    {/* Rank */}
                    <td className="px-3 py-2.5 text-center">
                      {i === 0 ? <span className="text-bocce-gold font-bold text-base">🥇</span>
                      : i === 1 ? <span className="text-gray-400 font-bold text-base">🥈</span>
                      : i === 2 ? <span className="text-amber-600 font-bold text-base">🥉</span>
                      : <span className="text-gray-400">{i + 1}</span>}
                    </td>

                    {/* Name */}
                    <td className="px-3 py-2.5">
                      {row.isUuid ? (
                        <Link to={`/igraci/${row.playerId}`}
                          className="font-medium text-gray-800 hover:text-bocce-green"
                          onClick={e => e.stopPropagation()}>
                          {row.displayName}
                        </Link>
                      ) : (
                        <span className="font-medium text-gray-600 italic"
                          title="Vnesen kot prosto besedilo — ni v registru">
                          {row.displayName}
                        </span>
                      )}
                    </td>

                    {/* Club */}
                    <td className="px-3 py-2.5 text-gray-500 hidden sm:table-cell">
                      {row.club ?? '—'}
                    </td>

                    {/* Played */}
                    <td className="px-3 py-2.5 text-right text-gray-600 hidden md:table-cell">
                      {row.totalPlayed > 0 ? `${row.totalMatchPointsFor}/${row.totalPlayed * 2}` : '—'}
                    </td>

                    {/* Success % */}
                    <td className="px-3 py-2.5 text-right hidden md:table-cell">
                      {row.totalPlayed > 0 ? (
                        <span className={`font-medium ${
                          row.uspesnostPct >= 0.7 ? 'text-bocce-green' :
                          row.uspesnostPct >= 0.5 ? 'text-yellow-600' : 'text-red-500'
                        }`}>
                          {(row.uspesnostPct * 100).toFixed(1)} %
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Liga rang */}
                    <td className="px-3 py-2.5 text-right text-gray-500">
                      {row.ligaRang > 0 ? row.ligaRang.toFixed(2) : <span className="text-gray-300">—</span>}
                    </td>

                    {/* DP pts */}
                    <td className="px-3 py-2.5 text-right text-bocce-gold font-medium">
                      {row.dpPts > 0 ? `+${row.dpPts}` : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Total rang */}
                    <td className="px-3 py-2.5 text-right font-bold">
                      {row.rang > 0
                        ? <span className="text-bocce-green">{row.rang.toFixed(2)}</span>
                        : <span className="text-gray-300">0.00</span>}
                    </td>

                    {/* Expand toggle */}
                    <td className="px-3 py-2.5 text-center text-gray-400 text-xs">
                      {expanded === row.playerId ? '▲' : '▼'}
                    </td>
                  </tr>

                  {/* Expanded breakdown */}
                  {expanded === row.playerId && (
                    <tr key={`${row.playerId}-exp`} className="bg-bocce-green/5">
                      <td colSpan={9} className="px-6 py-3">
                        <div className="grid sm:grid-cols-2 gap-4 text-xs text-gray-600">
                          {/* Liga contributions */}
                          {row.ligaEntries.length > 0 && (
                            <div>
                              <p className="font-semibold text-gray-700 mb-2">Liga rang</p>
                              <div className="space-y-1">
                                {row.ligaEntries.map(s => (
                                  <div key={s.name} className={`flex items-center gap-2 ${s.counted ? '' : 'opacity-40'}`}>
                                    <span className="px-2 py-0.5 rounded bg-bocce-green/10 text-bocce-green font-medium">
                                      {TIER_LABELS[s.tier] ?? s.tier}
                                    </span>
                                    <span className="text-gray-700 truncate">{s.name}</span>
                                    <span className="ml-auto font-bold shrink-0">
                                      {s.counted
                                        ? <span className="text-bocce-green">+{s.rang.toFixed(2)}</span>
                                        : <span className="line-through text-gray-400" title="Dvojna registracija — šteje liga z višjim rangom">+{s.rang.toFixed(2)}</span>}
                                    </span>
                                  </div>
                                ))}
                                {row.ligaEntries.some(s => !s.counted) && (
                                  <p className="text-[11px] text-gray-400 italic pt-1">
                                    Dvojna registracija — v rang šteje liga z višjim rangom.
                                  </p>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Championship contributions */}
                          {row.champEntries.length > 0 && (
                            <div>
                              <p className="font-semibold text-gray-700 mb-2">Državna prvenstva</p>
                              <div className="space-y-1">
                                {row.champEntries.map((c, ci) => (
                                  <div key={ci} className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded bg-bocce-gold/20 text-yellow-700 font-medium shrink-0">
                                      {c.placeLabel}
                                    </span>
                                    <span className="text-gray-700 truncate">{c.champName}</span>
                                    <span className="ml-auto font-bold text-bocce-gold shrink-0">
                                      +{c.pts}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <p className="text-xs text-gray-400 mt-4 text-right">
          {rows.length} igralcev · zadnjih 365 dni · klikni vrstico za razčlenitev
        </p>
      )}
    </div>
  )
}
