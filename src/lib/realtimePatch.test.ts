import { describe, it, expect } from 'vitest'
import { mergeRowById, reloadDelayMs, RELOAD_DELAY_MS, RELOAD_JITTER_MS } from './realtimePatch'

describe('mergeRowById', () => {
  it('posodobi ujemajočo se vrstico', () => {
    const list = [{ id: 'a', home_score: 0 }, { id: 'b', home_score: 0 }]
    expect(mergeRowById(list, { id: 'b', home_score: 13 })).toEqual([
      { id: 'a', home_score: 0 },
      { id: 'b', home_score: 13 },
    ])
  })

  it('ohrani embede, ki jih payload ne vsebuje', () => {
    // Ravno to je past: payload nese samo stolpce tabele, zato bi zamenjava
    // vrstice pobrisala home_team in stran bi ostala brez imen ekip.
    const list = [{
      id: 'a',
      status: 'scheduled',
      home_team: { id: 't1', club_name: 'BK Postojna' },
      chief_judge: { full_name: 'Sodnik' },
    }]
    const merged = mergeRowById(list, { id: 'a', status: 'completed' })
    expect(merged[0]).toEqual({
      id: 'a',
      status: 'completed',
      home_team: { id: 't1', club_name: 'BK Postojna' },
      chief_judge: { full_name: 'Sodnik' },
    })
  })

  it('ne doda vrstice, ki je v seznamu ni', () => {
    const list = [{ id: 'a', home_score: 0 }]
    expect(mergeRowById(list, { id: 'z', home_score: 5 })).toEqual(list)
  })

  it('vrne isto referenco, kadar ni sprememb', () => {
    const list = [{ id: 'a', home_score: 0 }]
    expect(mergeRowById(list, { id: 'z', home_score: 5 })).toBe(list)
  })

  it('ne spremeni izvirnega seznama', () => {
    const list = [{ id: 'a', home_score: 0 }]
    mergeRowById(list, { id: 'a', home_score: 13 })
    expect(list[0].home_score).toBe(0)
  })
})

describe('reloadDelayMs', () => {
  it('je znotraj meja pri obeh skrajnostih naključja', () => {
    expect(reloadDelayMs(0)).toBe(RELOAD_DELAY_MS)
    expect(reloadDelayMs(0.999)).toBeLessThan(RELOAD_DELAY_MS + RELOAD_JITTER_MS)
    expect(reloadDelayMs(0.999)).toBeGreaterThan(RELOAD_DELAY_MS)
  })

  it('razprši odjemalce — dve različni naključji dasta različna zamika', () => {
    expect(reloadDelayMs(0.1)).not.toBe(reloadDelayMs(0.9))
  })

  it('nikoli ne vrne zamika 0 (sunek v isti milisekundi)', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.99]) {
      expect(reloadDelayMs(r)).toBeGreaterThanOrEqual(RELOAD_DELAY_MS)
    }
  })
})
