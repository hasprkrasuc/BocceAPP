import { describe, it, expect } from 'vitest'
import { isFemale, eligibleSecondaryTeams, isAgeEligible, calcAge, latestSeasonsOnly } from './doubleRegistration'

describe('isFemale', () => {
  it('prepozna "Ž" kot žensko', () => {
    expect(isFemale('Ž')).toBe(true)
  })
  it('"M" ni ženska', () => {
    expect(isFemale('M')).toBe(false)
  })
  it('null/prazno ni ženska', () => {
    expect(isFemale(null)).toBe(false)
    expect(isFemale(undefined)).toBe(false)
    expect(isFemale('')).toBe(false)
  })
})

describe('eligibleSecondaryTeams', () => {
  const teams = [
    { id: 'w1', club_name: 'ŽBK Hrast',    tier: '1_liga',     category: 'women' },
    { id: 'ws', club_name: 'Skala Sežana', tier: 'super_liga', category: 'women' },
    { id: 'm1', club_name: 'Čirče',        tier: '1_liga',     category: 'men' },
    { id: 'ms', club_name: 'QAP Postojna', tier: 'super_liga', category: 'men' },
  ]

  it('ženska: dovoljena je samo 1. liga – članice', () => {
    const my = [{ id: 'ws', tier: 'super_liga' }]
    const res = eligibleSecondaryTeams('Ž', my, teams)
    expect(res.map(t => t.id)).toEqual(['w1'])
  })

  it('ženska: izloči ekipo, kjer je že vpisana', () => {
    const my = [{ id: 'w1', tier: '1_liga' }]
    const res = eligibleSecondaryTeams('Ž', my, teams)
    expect(res).toEqual([])
  })

  it('ženska: ne ponudi moških ekip', () => {
    const my = [{ id: 'ws', tier: 'super_liga' }]
    const res = eligibleSecondaryTeams('Ž', my, teams)
    expect(res.some(t => t.category === 'men')).toBe(false)
  })

  it('moški: super liga → 1. liga (združljiv tier), brez ženskih ekip', () => {
    const my = [{ id: 'ms', tier: 'super_liga' }]
    const res = eligibleSecondaryTeams('M', my, teams)
    expect(res.map(t => t.id)).toEqual(['m1'])
  })

  it('moški: 1. liga ne more v 2. ligo (isti termin), lahko pa v super ligo', () => {
    const extra = { id: 'm2', club_name: 'Loka', tier: '2_liga_zahod', category: 'men' }
    const my = [{ id: 'm1', tier: '1_liga' }]
    const res = eligibleSecondaryTeams('M', my, [...teams, extra])
    expect(res.map(t => t.id)).toEqual(['ms'])
  })
})

describe('isAgeEligible (≤23 velja za oba spola)', () => {
  const yearsAgo = (n: number) => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - n)
    return d.toISOString().slice(0, 10)
  }
  it('23 let je upravičen', () => {
    expect(isAgeEligible(yearsAgo(23))).toBe(true)
  })
  it('24 let ni upravičen', () => {
    expect(isAgeEligible(yearsAgo(24))).toBe(false)
  })
})

describe('calcAge — BZS pikčasti format datuma (DD.MM.YYYY)', () => {
  // 450 profilov v bazi ima datum kot "7.2.2006". new Date() tak niz bodisi
  // zavrne bodisi ga NAROBE prebere kot ameriški M.D.YYYY (7.2. → 2. julij!).
  const pad = (x: number) => String(x).padStart(2, '0')
  const mk = (offsetDays: number, yearsBack: number) => {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays)
    d.setFullYear(d.getFullYear() - yearsBack)
    return {
      dotted: `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`,
      padded: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`,
      iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    }
  }

  it('pikčasti datum vrne ISTO starost kot isti datum v ISO (D.M.YYYY in DD.MM.YYYY)', () => {
    // več odmikov okoli rojstnega dne — ujame zamenjavo dan/mesec in neparsiranje
    for (const off of [-100, -30, +30, +100]) {
      const { dotted, padded, iso } = mk(off, 20)
      const expected = calcAge(iso)
      expect(expected).not.toBeNull()
      expect(calcAge(dotted), `dotted ${dotted}`).toBe(expected)
      expect(calcAge(padded), `padded ${padded}`).toBe(expected)
    }
  })

  it('isAgeEligible dela s pikčastim datumom (≤23)', () => {
    expect(isAgeEligible(mk(-30, 19).dotted)).toBe(true)
    expect(isAgeEligible(mk(-30, 30).dotted)).toBe(false)
  })

  it('neveljaven datum vrne null', () => {
    expect(calcAge('20.8..1959')).toBeNull()
    expect(calcAge('ni datum')).toBeNull()
    expect(calcAge('12.11.2018.1211018505236')).toBeNull()
  })
})

describe('latestSeasonsOnly — najnovejša sezona po kategoriji (tudi zaključena)', () => {
  const teams = [
    { id: 'm-new',  season: { year: 2026, category: 'men',   status: 'completed' } },  // Super liga 2025/26 — zaključena!
    { id: 'm-old',  season: { year: 2025, category: 'men',   status: 'completed' } },
    { id: 'w-new',  season: { year: 2025, category: 'women', status: 'active' } },
    { id: 'w-old',  season: { year: 2024, category: 'women', status: 'completed' } },
    { id: 'brez',   season: null },
  ]
  it('obdrži le ekipe iz najnovejšega leta znotraj svoje kategorije', () => {
    const res = latestSeasonsOnly(teams)
    expect(res.map(t => t.id).sort()).toEqual(['m-new', 'w-new'])
  })
  it('zaključena sezona NI izločena (šteje le leto)', () => {
    const res = latestSeasonsOnly(teams)
    expect(res.some(t => t.id === 'm-new')).toBe(true)  // completed, a najnovejša
  })
  it('prazen seznam vrne prazen seznam', () => {
    expect(latestSeasonsOnly([])).toEqual([])
  })
})
