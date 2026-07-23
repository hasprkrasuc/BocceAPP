import { useState } from 'react'
import { supabase } from '../supabase'

/**
 * Vnos številke steze pri tekmi. Shrani se samodejno ob izgubi fokusa (klik
 * drugam) ali s tipko Enter; po uspešnem shranjevanju kratko pokaže »✓«.
 */
export default function LaneInput({ matchId, initial }: { matchId: string; initial: string }) {
  const [value, setValue] = useState(initial)
  const [saved, setSaved] = useState(false)
  const save = async () => {
    const { error } = await supabase.from('matches').update({ lane_number: value.trim() || null }).eq('id', matchId)
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 1500) }
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        placeholder="npr. 3"
        className="w-16 border border-gray-300 rounded px-2 py-0.5 bg-white" />
      {saved && <span className="text-green-600 text-[11px] font-medium">✓</span>}
    </span>
  )
}
