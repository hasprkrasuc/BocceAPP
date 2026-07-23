import { useState } from 'react'
import { supabase } from '../supabase'
import type { JudgeOption } from './GroupBracket'

/**
 * Izbira sodnika za posamezno tekmo (matches.judge_id). Shrani se ob izbiri;
 * po uspehu kratko pokaže »✓«. Dodeljeni sodnik lahko nato vnaša rezultat.
 */
export default function MatchJudgeSelect({ matchId, initial, judges }: {
  matchId: string
  initial: string
  judges: JudgeOption[]
}) {
  const [value, setValue] = useState(initial)
  const [saved, setSaved] = useState(false)
  const save = async (v: string) => {
    setValue(v)
    const { error } = await supabase.from('matches').update({ judge_id: v || null }).eq('id', matchId)
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 1500) }
  }
  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      <select value={value} onChange={e => save(e.target.value)}
        className="border border-gray-200 rounded px-1 py-0.5 text-[10px] bg-white min-w-0 max-w-[120px]">
        <option value="">— Sodnik —</option>
        {judges.map(j => <option key={j.id} value={j.id}>{j.full_name}</option>)}
      </select>
      {saved && <span className="text-green-600 text-[10px]">✓</span>}
    </span>
  )
}
