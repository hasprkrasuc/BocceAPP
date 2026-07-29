import { useCallback, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { RELOAD_DELAY_MS, RELOAD_JITTER_MS, reloadDelayMs } from './realtimePatch'

export { mergeRowById, RELOAD_DELAY_MS, RELOAD_JITTER_MS } from './realtimePatch'

/**
 * Realtime naročnina na eno tabelo, napisana za tekmovalni dan.
 *
 * Prejšnji vzorec je bil `postgres_changes` → `load()`, torej popolno ponovno
 * nalaganje pri VSAKEM naročniku ob vsaki spremembi. Pri 150 gledalcih na isti
 * ligi je to 600 sočasnih poizvedb v istem trenutku proti bazi s 60 povezavami
 * (thundering herd). Tu sta dve pravili:
 *
 *  - UPDATE (med tekmovanjem ~95 % prometa: vpis rezultata) se obdela iz
 *    payloada — brez dodatne poizvedbe.
 *  - INSERT/DELETE spremenita strukturo seznama, zato je refetch upravičen; a
 *    gre skozi `scheduleReload` z zamikom IN naključnim raztezkom, da 150
 *    odjemalcev ne udari v isti milisekundi.
 *
 * Naročnina se ustavi, ko zavihek ni viden — velik del uporabnikov ima stran
 * odprto v ozadju in ti odjemalci ne smejo obremenjevati baze. Ob vrnitvi v
 * ospredje se enkrat izvede dohitevni refetch (`onResume`).
 */

/**
 * Klic z zamikom in naključnim raztezkom. Zaporedni klici se združijo v enega
 * (debounce). Vrne stabilni `schedule` in `cancel`.
 */
export function useJitteredCallback(
  fn: () => void,
  delay = RELOAD_DELAY_MS,
  jitter = RELOAD_JITTER_MS,
): { schedule: () => void; cancel: () => void } {
  const fnRef = useRef(fn)
  fnRef.current = fn
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancel = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
  }, [])

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      fnRef.current()
    }, reloadDelayMs(Math.random(), delay, jitter))
  }, [delay, jitter])

  // Počisti ob odmontiranju — sicer refetch pade na odmontirano komponento.
  useEffect(() => cancel, [cancel])

  return { schedule, cancel }
}

interface Options<Row> {
  /**
   * Ime kanala. `null` pomeni "še ne vem" (npr. id še ni naložen) — takrat se
   * naročnina ne vzpostavi.
   */
  channel: string | null
  table: string
  /** PostgREST filter, npr. `season_id=eq.<uuid>`. */
  filter?: string
  /** UPDATE: vrstica je v payloadu, zato brez dodatne poizvedbe. */
  onUpdate: (row: Row) => void
  /** INSERT/DELETE: struktura se je spremenila — z zamikom in jitterjem. */
  onStructuralChange: () => void
  /** Enkraten dohitevni refetch ob vrnitvi zavihka v ospredje. */
  onResume?: () => void
}

export function useRealtimeTable<Row extends { id: string }>({
  channel, table, filter, onUpdate, onStructuralChange, onResume,
}: Options<Row>): void {
  // Klicatelji podajo funkcije, ki nastanejo znova ob vsakem izrisu; skozi ref
  // jih beremo brez ponovnega naročanja na kanal.
  const onUpdateRef = useRef(onUpdate)
  const onStructuralRef = useRef(onStructuralChange)
  const onResumeRef = useRef(onResume)
  onUpdateRef.current = onUpdate
  onStructuralRef.current = onStructuralChange
  onResumeRef.current = onResume

  const { schedule, cancel } = useJitteredCallback(() => onStructuralRef.current())
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    if (!channel) return

    const ch = supabase
      .channel(channel)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        payload => {
          if (payload.eventType === 'UPDATE') {
            onUpdateRef.current(payload.new as Row)
            return
          }
          schedule()
        },
      )
    channelRef.current = ch
    if (document.visibilityState === 'visible') ch.subscribe()

    const onVisibility = () => {
      const c = channelRef.current
      if (!c) return
      if (document.visibilityState === 'visible') {
        c.subscribe()
        onResumeRef.current?.()      // dohitevni refetch — v ozadju smo zamudili spremembe
      } else {
        cancel()                     // ne sproži refetcha, ko nas nihče ne gleda
        c.unsubscribe()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      cancel()
      channelRef.current = null
      supabase.removeChannel(ch)
    }
  }, [channel, table, filter, schedule, cancel])
}
