import { describe, it, expect } from 'vitest'
import {
  CILJ_BALINANJE, MEJA_RAZUMNOSTI,
  najvisjiRezultat, preveriRezultat, seIgraNaTrinajst,
} from './rezultatTekme'

describe('najvisjiRezultat', () => {
  it('balinanje se igra na 13', () => {
    for (const d of ['trojka', 'dvojka', 'posamezno']) {
      expect(najvisjiRezultat(d)).toBe(CILJ_BALINANJE)
      expect(seIgraNaTrinajst(d)).toBe(true)
    }
  })

  it('točkovne discipline nimajo tekmovalne meje 13', () => {
    for (const d of ['krog', 'hitrostno', 'natancno', 'blizanje', 'blizanje_krog', 'stafeta', 'podaljsek']) {
      expect(najvisjiRezultat(d)).toBe(MEJA_RAZUMNOSTI)
      expect(seIgraNaTrinajst(d)).toBe(false)
    }
  })

  it('disciplina gre skozi normalizacijo zapisa', () => {
    expect(najvisjiRezultat('igra v krog')).toBe(MEJA_RAZUMNOSTI)
    expect(najvisjiRezultat('Igra v krog')).toBe(MEJA_RAZUMNOSTI)
    expect(najvisjiRezultat('dvojice')).toBe(CILJ_BALINANJE)
  })

  it('nezapisana disciplina šteje za balinanje', () => {
    expect(najvisjiRezultat(null)).toBe(CILJ_BALINANJE)
    expect(najvisjiRezultat(undefined)).toBe(CILJ_BALINANJE)
    expect(najvisjiRezultat('   ')).toBe(CILJ_BALINANJE)
  })

  it('neprepoznana disciplina ne obvelja za balinanje', () => {
    // Zavrnjen vnos sodnika sredi tekmovanja je dražji od prepuščene tipkarske
    // napake, zato neznana disciplina dobi ohlapno in ne stroge meje.
    expect(najvisjiRezultat('balinanje po novem')).toBe(MEJA_RAZUMNOSTI)
  })
})

describe('preveriRezultat — igra v krog', () => {
  it('spusti 18:19, ki ga je stara meja zavrnila', () => {
    expect(preveriRezultat(18, 19, 'krog')).toBeNull()
  })

  it('spusti najvišji rezultat, ki v bazi obstaja', () => {
    expect(preveriRezultat(32, 21, 'krog')).toBeNull()
  })

  it('ustavi očiten polom vnosa', () => {
    expect(preveriRezultat(2026, 19, 'krog')).toMatch(/presega 200/)
    expect(preveriRezultat(MEJA_RAZUMNOSTI + 1, 1, 'krog')).not.toBeNull()
    expect(preveriRezultat(MEJA_RAZUMNOSTI, 1, 'krog')).toBeNull()
  })
})

describe('preveriRezultat — balinanje', () => {
  it('spusti običajen izid', () => {
    expect(preveriRezultat(13, 9, 'dvojka')).toBeNull()
    expect(preveriRezultat(0, 13, 'posamezno')).toBeNull()
  })

  it('ustavi rezultat nad ciljem, tudi kadar je samo eden', () => {
    // Stara meja (`a > 13 && b > 13`) je 13:99 mirno shranila.
    expect(preveriRezultat(13, 99, 'dvojka')).toMatch(/13 točk/)
    expect(preveriRezultat(14, 2, 'posamezno')).toMatch(/13 točk/)
    expect(preveriRezultat(18, 19, 'dvojka')).not.toBeNull()
  })
})

describe('preveriRezultat — skupna pravila', () => {
  it('izenačenje ostane prepovedano pri vseh disciplinah', () => {
    // Napredovalca skupine določa zmagovalec določene tekme; tekma brez
    // zmagovalca izločilnih bojev ne napolni.
    expect(preveriRezultat(19, 19, 'krog')).toMatch(/Izenačen/)
    expect(preveriRezultat(13, 13, 'dvojka')).toMatch(/Izenačen/)
    expect(preveriRezultat(0, 0, null)).toMatch(/Izenačen/)
  })

  it('zavrne negativen in neveljaven vnos', () => {
    expect(preveriRezultat(-1, 5, 'krog')).toMatch(/negativen/)
    expect(preveriRezultat(NaN, 5, 'krog')).toMatch(/veljavni/)
    expect(preveriRezultat(5, 1.5, 'krog')).toMatch(/celo število/)
  })
})
