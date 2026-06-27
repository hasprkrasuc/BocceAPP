import { describe, it, expect } from 'vitest'
import { isFemale, eligibleSecondaryTeams, isAgeEligible } from './doubleRegistration'

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
