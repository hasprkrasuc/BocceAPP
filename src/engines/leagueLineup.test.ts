import { describe, it, expect } from 'vitest'
import { evaluatePlayerLineup, seasonUsesBlock2Rule, type LineupDisc } from './leagueLineup'

// Bloki ženske 1. lige: blok 2 = hitrostno, natancno (izbijanje), blizanje (bližanje), stafeta
const HIT: LineupDisc = { discipline_type: 'hitrostno', block_number: 2 }
const STA: LineupDisc = { discipline_type: 'stafeta', block_number: 2 }
const NAT: LineupDisc = { discipline_type: 'natancno', block_number: 2 }   // izbijanje
const NAT2: LineupDisc = { discipline_type: 'blizanje', block_number: 2 }  // bližanje
const DVO: LineupDisc = { discipline_type: 'dvojka', block_number: 1 }
const POS: LineupDisc = { discipline_type: 'posamezno', block_number: 3 }
const KROG: LineupDisc = { discipline_type: 'krog', block_number: 1 }

describe('evaluatePlayerLineup — max disciplin (4 le ob Hitrostno+Štafeta)', () => {
  it('Hitrostno+Štafeta + 2 drugi = 4 disciplin je dovoljeno', () => {
    const r = evaluatePlayerLineup([HIT, STA, DVO, POS])
    expect(r.maxAllowed).toBe(4)
    expect(r.ok).toBe(true)
  })

  it('5 disciplin ni nikoli dovoljeno', () => {
    expect(evaluatePlayerLineup([HIT, STA, DVO, POS, KROG]).countViolation).toBe(true)
  })

  it('brez para Hitrostno+Štafeta je max 3', () => {
    const r = evaluatePlayerLineup([DVO, POS, KROG])
    expect(r.maxAllowed).toBe(3)
    expect(r.ok).toBe(true)
  })

  it('4 discipline brez para Hitrostno+Štafeta presežejo max', () => {
    const r = evaluatePlayerLineup([NAT, DVO, POS, KROG])
    expect(r.maxAllowed).toBe(3)
    expect(r.countViolation).toBe(true)
  })
})

describe('evaluatePlayerLineup — blok 2 je prost pri ≤3 disciplinah', () => {
  it('Natančno + Štafeta pri 3 disciplinah je dovoljeno (primer Neža Bobnar)', () => {
    const r = evaluatePlayerLineup([NAT, STA, DVO])  // 3 skupaj, 2 v bloku 2, a ne par Hit+Šta
    expect(r.ok).toBe(true)
  })

  it('izbijanje + bližanje + ena druga (3) je dovoljeno', () => {
    expect(evaluatePlayerLineup([NAT, NAT2, DVO]).ok).toBe(true)
  })

  it('Natančno+Štafeta kot par NE omogoča 4. discipline', () => {
    const r = evaluatePlayerLineup([NAT, STA, DVO, POS])  // 4 skupaj, blok-2 par ni Hit+Šta
    expect(r.maxAllowed).toBe(3)
    expect(r.countViolation).toBe(true)
  })

  it('Hitrostno+Štafeta v bloku 2 omogoča 4. disciplino', () => {
    const r = evaluatePlayerLineup([HIT, STA, DVO])  // 3 skupaj, lahko bi dodala 4.
    expect(r.maxAllowed).toBe(4)
    expect(r.ok).toBe(true)
  })
})

describe('evaluatePlayerLineup — konkretni primeri (po opisu pravila)', () => {
  it('Blok1 + Hitrostno + Štafeta + Blok3 = 4 disciplin je dovoljeno', () => {
    const r = evaluatePlayerLineup([DVO, HIT, STA, POS])  // DVO=blok1, POS=blok3
    expect(r.maxAllowed).toBe(4)
    expect(r.ok).toBe(true)
  })

  it('Blok1 + Natančno + Štafeta = 3 je dovoljeno', () => {
    expect(evaluatePlayerLineup([DVO, NAT, STA]).ok).toBe(true)
  })

  it('Blok1 + Natančno + Štafeta + Blok3 = 4 NI dovoljeno (par ni Hitrostno+Štafeta)', () => {
    const r = evaluatePlayerLineup([DVO, NAT, STA, POS])
    expect(r.maxAllowed).toBe(3)
    expect(r.countViolation).toBe(true)
  })
})

describe('seasonUsesBlock2Rule — velja LE za žensko ligo', () => {
  it('velja za žensko sezono (blok 2 = Hitrostno + Štafeta + Natančno + Bližanje)', () => {
    expect(seasonUsesBlock2Rule([HIT, STA, NAT, NAT2, DVO])).toBe(true)
  })
  it('NE velja za moško sezono (blok 2 = Hitrostno + Štafeta + Natančno, brez Bližanja)', () => {
    expect(seasonUsesBlock2Rule([HIT, STA, NAT, DVO])).toBe(false)
  })
  it('ne velja brez tehničnih disciplin v bloku 2', () => {
    expect(seasonUsesBlock2Rule([DVO, POS, KROG])).toBe(false)
  })
})
