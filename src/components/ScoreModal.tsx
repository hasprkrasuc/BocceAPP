import { useState } from 'react'
import { teamDisplayName } from '../engines/tournament'
import type { Match } from '../types'

interface Props {
  match: Match
  onSave: (match: Match, scoreA: number, scoreB: number) => Promise<void>
  onClose: () => void
}

export default function ScoreModal({ match, onSave, onClose }: Props) {
  const [scoreA, setScoreA] = useState<string>(match.score_a?.toString() ?? '')
  const [scoreB, setScoreB] = useState<string>(match.score_b?.toString() ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const nameA = match.team_a ? teamDisplayName(match.team_a.registration) : '???'
  const nameB = match.team_b ? teamDisplayName(match.team_b.registration) : '???'

  async function handleSave() {
    const a = parseInt(scoreA)
    const b = parseInt(scoreB)
    if (isNaN(a) || isNaN(b)) { setError('Vnesi veljavni rezultat'); return }
    if (a < 0 || b < 0)       { setError('Rezultat ne more biti negativen'); return }
    if (a === b)               { setError('Izenačen rezultat ni dovoljen v bocce'); return }
    if (a > 13 && b > 13)     { setError('Rezultat presega 13 točk za oba — preveri vnos'); return }
    setError('')
    setSaving(true)
    try {
      await onSave(match, a, b)
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div style={{ minHeight: 300 }} className="flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="bg-bocce-green px-5 py-4">
          <h2 className="text-white font-semibold">{match.winner_id ? 'Popravi rezultat' : 'Vnesi rezultat'}</h2>
          <p className="text-green-200 text-sm">Tekma {match.match_number}</p>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{nameA}</label>
            <input type="number" min="0" max="13" value={scoreA}
              onChange={e => setScoreA(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-center text-2xl font-bold focus:ring-2 focus:ring-bocce-green focus:border-transparent"
              placeholder="0" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{nameB}</label>
            <input type="number" min="0" max="13" value={scoreB}
              onChange={e => setScoreB(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-center text-2xl font-bold focus:ring-2 focus:ring-bocce-green focus:border-transparent"
              placeholder="0" />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 transition-colors">
            Prekliči
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-bocce-green text-white py-2 rounded-lg hover:bg-bocce-green-light transition-colors disabled:opacity-50">
            {saving ? 'Shranjujem...' : 'Shrani'}
          </button>
        </div>
      </div>
    </div>
  )
}
