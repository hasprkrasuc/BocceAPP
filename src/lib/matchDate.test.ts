import { describe, it, expect } from 'vitest'
import {
  matchDatePart, matchTimePart, formatMatchDateTime,
  toDateTimeLocal, skupniTerminKola, povzetekTerminovKola,
} from './matchDate'

// Termin beremo DOBESEDNO iz niza, brez časovnega zamika: kar admin vtipka, se
// tako shrani in tako prikaže. Ti testi to konvencijo pripnejo — če bi kdo uvedel
// pretvorbo prek Date, bi se vsi obstoječi termini premaknili za uro ali dve.
describe('matchDate — dobesedno branje, brez časovnega zamika', () => {
  it('iz timestamptz vzame zapisano uro, ne preračunane', () => {
    expect(matchTimePart('2026-09-04T18:00:00+00:00')).toBe('18:00')
    expect(matchDatePart('2026-09-04T18:00:00+00:00')).toBe('4. 9. 2026')
  })

  it('zamik v nizu na prikaz ne vpliva (isti znaki = isti prikaz)', () => {
    expect(matchTimePart('2026-09-04T18:00:00+02:00')).toBe('18:00')
    expect(matchTimePart('2026-09-04T18:00:00Z')).toBe('18:00')
  })

  it('polnoč pomeni "samo datum, brez ure"', () => {
    expect(matchTimePart('2026-09-04T00:00:00+00:00')).toBe('')
    expect(formatMatchDateTime('2026-09-04T00:00:00+00:00')).toBe('4. 9. 2026')
    expect(formatMatchDateTime('2026-09-04T18:00:00+00:00')).toBe('4. 9. 2026 ob 18:00')
  })

  it('prazno in neveljavno da prazen niz', () => {
    for (const v of [null, undefined, '', 'nekaj']) {
      expect(matchDatePart(v)).toBe('')
      expect(matchTimePart(v)).toBe('')
      expect(toDateTimeLocal(v)).toBe('')
    }
  })
})

describe('toDateTimeLocal — vrednost za <input type="datetime-local">', () => {
  it('iz ISO vzame prvih 16 znakov', () => {
    expect(toDateTimeLocal('2026-09-04T18:00:00+00:00')).toBe('2026-09-04T18:00')
  })

  it('sprejme tudi zapis s presledkom namesto T', () => {
    expect(toDateTimeLocal('2026-09-04 18:00:00+00')).toBe('2026-09-04T18:00')
  })

  it('kroži brez premika: vrednost iz vnosa se prebere nazaj enaka', () => {
    const vnos = '2026-09-04T18:00'
    expect(toDateTimeLocal(`${vnos}:00+00:00`)).toBe(vnos)
  })
})

describe('skupniTerminKola', () => {
  const t = (s: string) => `${s}:00+00:00`

  it('vse tekme ob istem terminu → ta termin', () => {
    expect(skupniTerminKola([t('2026-09-04T18:00'), t('2026-09-04T18:00'), t('2026-09-04T18:00')]))
      .toBe('2026-09-04T18:00')
  })

  it('ena tekma odstopa → prazno (kolo nima enotnega termina)', () => {
    expect(skupniTerminKola([t('2026-09-04T18:00'), t('2026-09-05T18:00')])).toBe('')
  })

  it('katera koli tekma brez termina → prazno', () => {
    expect(skupniTerminKola([t('2026-09-04T18:00'), null])).toBe('')
    expect(skupniTerminKola([null, null])).toBe('')
  })

  it('prazen seznam → prazno', () => {
    expect(skupniTerminKola([])).toBe('')
  })
})

describe('povzetekTerminovKola', () => {
  const t = (s: string) => `${s}:00+00:00`

  it('enoten termin izpiše v celoti', () => {
    expect(povzetekTerminovKola([t('2026-09-04T18:00'), t('2026-09-04T18:00')]))
      .toBe('4. 9. 2026 ob 18:00')
  })

  it('nobena tekma nima termina', () => {
    expect(povzetekTerminovKola([null, null, undefined])).toBe('brez termina')
  })

  it('isti dan, različne ure → dan in koliko jih je brez', () => {
    expect(povzetekTerminovKola([t('2026-09-04T18:00'), t('2026-09-04T20:00')])).toBe('4. 9. 2026')
    expect(povzetekTerminovKola([t('2026-09-04T18:00'), null])).toBe('4. 9. 2026 · 1 brez termina')
  })

  it('različni dnevi → koliko jih je', () => {
    expect(povzetekTerminovKola([t('2026-09-04T18:00'), t('2026-09-05T18:00')]))
      .toBe('2 različnih datumov')
  })
})
