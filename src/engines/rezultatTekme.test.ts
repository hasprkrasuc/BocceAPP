import { describe, it, expect } from 'vitest'
import {
  CILJ_BALINANJE, MEJA_RAZUMNOSTI,
  najvisjiRezultat, preveriRezultat, seIgraNaTrinajst,
} from './rezultatTekme'
import { normalizirajDisciplino } from './tournamentPlacement'

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
    // Sama meja tega NE dokaže: neprepoznana disciplina dobi prav tako
    // MEJA_RAZUMNOSTI, zato bi trditev o `igra v krog` obstala tudi, če bi
    // zapis iz slovarja izpadel. Zato najprej preverimo, da je zapis res
    // prepoznan, in šele nato mejo.
    expect(normalizirajDisciplino('igra v krog'), 'zapis »igra v krog« mora biti prepoznan').toBe('krog')
    expect(normalizirajDisciplino('Igra v krog')).toBe('krog')
    expect(najvisjiRezultat('igra v krog')).toBe(MEJA_RAZUMNOSTI)
    expect(najvisjiRezultat('Igra v krog')).toBe(MEJA_RAZUMNOSTI)

    // Balinarska smer je edina, ki mejo spremeni, zato normalizacijo dokaže
    // tudi brez pomoči.
    expect(normalizirajDisciplino('dvojice')).toBe('dvojka')
    expect(najvisjiRezultat('dvojice')).toBe(CILJ_BALINANJE)
  })

  it('nezapisana disciplina ne obvelja za balinanje', () => {
    // Disciplina je ob ustvarjanju tekmovanja neobvezna in je pozneje ni
    // mogoče popraviti; stroga meja bi sodnika zaklenila brez izhoda.
    expect(najvisjiRezultat(null)).toBe(MEJA_RAZUMNOSTI)
    expect(najvisjiRezultat(undefined)).toBe(MEJA_RAZUMNOSTI)
    expect(najvisjiRezultat('   ')).toBe(MEJA_RAZUMNOSTI)
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

describe('zaostritev ne sme udariti po tekmovanjih brez discipline', () => {
  // Stara koda je padla šele, če sta bila OBA rezultata nad 13. Na tekmovanju
  // brez vpisane discipline bi zaostren pogoj zavrnil izide, ki so se prej
  // shranili — in to je natanko tista zavrnitev sredi tekmovanja, ki jo
  // popravek odpravlja, le po drugi poti.
  it('enostranski točkovni izid se shrani kot prej', () => {
    expect(preveriRezultat(20, 5, null)).toBeNull()
    expect(preveriRezultat(13, 19, null)).toBeNull()
  })

  it('izid, ki je sprožil prijavo, se shrani tudi brez discipline', () => {
    expect(preveriRezultat(18, 19, null)).toBeNull()
    expect(preveriRezultat(18, 19, undefined)).toBeNull()
  })

  it('meja razumnosti pa še vedno velja', () => {
    expect(preveriRezultat(2026, 5, null)).not.toBeNull()
  })
})
