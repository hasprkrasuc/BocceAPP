import { describe, it, expect } from 'vitest'
import { veljavneIzdaje, kljucPrvenstva, type DpIzdaja } from './dpSerije'

const izdaja = (o: Partial<DpIzdaja> & { date: string }): DpIzdaja => ({
  category: 'men', discipline_type: 'posamezno', imaIzide: true, ...o,
})

describe('kljucPrvenstva', () => {
  it('loči prvenstva po kategoriji in disciplini', () => {
    expect(kljucPrvenstva(izdaja({ date: '2026-01-01' })))
      .toBe(kljucPrvenstva(izdaja({ date: '2025-01-01' })))
    expect(kljucPrvenstva(izdaja({ date: '2026-01-01', category: 'women' })))
      .not.toBe(kljucPrvenstva(izdaja({ date: '2026-01-01' })))
    expect(kljucPrvenstva(izdaja({ date: '2026-01-01', discipline_type: 'dvojka' })))
      .not.toBe(kljucPrvenstva(izdaja({ date: '2026-01-01' })))
  })
})

describe('veljavneIzdaje', () => {
  it('novejša izdaja izrine starejšo', () => {
    const staro = izdaja({ date: '2025-09-28' })
    const novo = izdaja({ date: '2026-09-13' })
    expect(veljavneIzdaje([staro, novo])).toEqual([novo])
  })

  it('vrstni red vhoda ne šteje', () => {
    const staro = izdaja({ date: '2025-09-28' })
    const novo = izdaja({ date: '2026-09-13' })
    expect(veljavneIzdaje([novo, staro])).toEqual([novo])
  })

  it('izdaja brez vpisanih izidov ne izrine starejše', () => {
    const staro = izdaja({ date: '2025-09-28' })
    const novo = izdaja({ date: '2026-09-13', imaIzide: false })
    expect(veljavneIzdaje([staro, novo])).toEqual([staro, novo])
  })

  it('ko novejša dobi izide, starejša odpade', () => {
    const staro = izdaja({ date: '2025-09-28' })
    const novo = izdaja({ date: '2026-09-13', imaIzide: true })
    expect(veljavneIzdaje([staro, novo])).toEqual([novo])
  })

  it('različna prvenstva se ne izrivajo', () => {
    const posamezno25 = izdaja({ date: '2025-09-28', discipline_type: 'posamezno' })
    const dvojice26 = izdaja({ date: '2026-09-06', discipline_type: 'dvojka' })
    expect(veljavneIzdaje([posamezno25, dvojice26])).toEqual([posamezno25, dvojice26])
  })

  it('MIX dvojice ne izrinejo članskih dvojic', () => {
    const clani = izdaja({ date: '2026-09-06', discipline_type: 'dvojka' })
    const mix = izdaja({ date: '2026-12-21', discipline_type: 'dvojka', category: 'mixed' })
    expect(veljavneIzdaje([clani, mix])).toEqual([clani, mix])
  })

  it('ženske in moški se ne izrivajo', () => {
    const clanice = izdaja({ date: '2026-06-27', category: 'women' })
    const clani = izdaja({ date: '2025-09-28', category: 'men' })
    expect(veljavneIzdaje([clanice, clani])).toEqual([clanice, clani])
  })

  it('od treh izdaj ostane le najnovejša', () => {
    const a = izdaja({ date: '2024-09-20' })
    const b = izdaja({ date: '2025-09-28' })
    const c = izdaja({ date: '2026-09-13' })
    expect(veljavneIzdaje([a, b, c])).toEqual([c])
  })

  it('izdaji z istim datumom obe obveljata', () => {
    const a = izdaja({ date: '2026-09-13' })
    const b = izdaja({ date: '2026-09-13' })
    expect(veljavneIzdaje([a, b])).toEqual([a, b])
  })

  it('če izidov nima nobena izdaja, ostanejo vse', () => {
    const a = izdaja({ date: '2025-09-28', imaIzide: false })
    const b = izdaja({ date: '2026-09-13', imaIzide: false })
    expect(veljavneIzdaje([a, b])).toEqual([a, b])
  })

  it('prazen seznam vrne prazen seznam', () => {
    expect(veljavneIzdaje([])).toEqual([])
  })

  it('ohrani dodatna polja vhodnih zapisov', () => {
    const novo = { ...izdaja({ date: '2026-09-13' }), id: 'x', name: 'DP 2026' }
    const staro = { ...izdaja({ date: '2025-09-28' }), id: 'y', name: 'DP 2025' }
    expect(veljavneIzdaje([staro, novo])).toEqual([novo])
  })
})
