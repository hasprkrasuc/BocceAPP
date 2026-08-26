import { describe, test, expect } from 'vitest'
import { SKLICI, kljucSklica } from './zdruzitevUporabnikov'
import { ROLE_ORDER } from '../lib/roles'
import { GENERIC_EMAIL_DOMAINS } from '../lib/genericEmail'

// api/user-merge.ts NE sme uvažati vrednosti iz src/ (Vercel zapakira le api/,
// uvoz pade z ERR_MODULE_NOT_FOUND), zato tri sezname podvaja. Ta test primerja
// izvorno besedilo obeh kopij — brez njega bi se razšli tiho, posledica pa bi
// bila združitev, ki polja ne prenese ali vlogo poniža.
//
// Datoteke beremo z Vitovim `?raw` in ne prek node:fs, kot to počnejo starejši
// sinhronizacijski testi: tam manjkajoči @types/node prispevajo po tri napake
// pri `npm run typecheck`, tu pa jih ni nobene.
import apiSource from '../../api/user-merge.ts?raw'
import engineSource from './zdruzitevUporabnikov.ts?raw'
import migracija from '../../supabase/migrations/20260826_02_zdruzi_uporabnika.sql?raw'

/** Besedilo med `const <ime> = [` in pripadajočim `]`, brez odvečnih presledkov. */
function seznam(source: string, ime: string, oznaka: string): string {
  const idx = source.indexOf(`const ${ime} = [`)
  if (idx === -1) throw new Error(`Ni najdenega seznama ${ime} v ${oznaka}`)
  const zacetek = source.indexOf('[', idx)
  let globina = 0
  let i = zacetek
  for (; i < source.length; i++) {
    if (source[i] === '[') globina++
    else if (source[i] === ']') { globina--; if (globina === 0) break }
  }
  if (globina !== 0) throw new Error(`Nezaključen seznam ${ime} v ${oznaka}`)
  return source.slice(zacetek + 1, i).replace(/\s+/g, ' ').trim()
}

const nizi = (s: string): string[] =>
  s.split(',').map(d => d.trim().replace(/['"]/g, '')).filter(Boolean)

describe('api/user-merge.ts <-> src — sinhronizacija podvojenih seznamov', () => {
  test('PRENOSLJIVA se ujema z zdruzitevUporabnikov.ts', () => {
    expect(
      seznam(apiSource, 'PRENOSLJIVA', 'api/user-merge.ts'),
      'Seznam prenosljivih polj se je razšel — popravi obe kopiji (api/user-merge.ts in src/engines/zdruzitevUporabnikov.ts)',
    ).toBe(seznam(engineSource, 'PRENOSLJIVA', 'src/engines/zdruzitevUporabnikov.ts'))
  })

  test('ROLE_ORDER se ujema s src/lib/roles.ts', () => {
    expect(
      nizi(seznam(apiSource, 'ROLE_ORDER', 'api/user-merge.ts')),
      'Vrstni red vlog se je razšel — združitev bi lahko ponižala vlogo',
    ).toEqual([...ROLE_ORDER])
  })

  test('GENERIC_EMAIL_DOMAINS se ujema s src/lib/genericEmail.ts', () => {
    expect(
      nizi(seznam(apiSource, 'GENERIC_EMAIL_DOMAINS', 'api/user-merge.ts')),
      'Seznam generičnih domen se je razšel — pravi naslov se ob združitvi ne bi prevzel',
    ).toEqual([...GENERIC_EMAIL_DOMAINS])
  })
})

describe('SKLICI <-> migracija 20260826_02', () => {
  test('vsak sklic iz motorja migracija tudi zares prestavi', () => {
    const manjkajo = SKLICI
      .filter(s => !migracija.includes(`'${kljucSklica(s)}'`))
      .map(kljucSklica)
    expect(
      manjkajo,
      'Motor našteva sklic, ki ga zdruzi_uporabnika ne prestavi — po združitvi bi ostal visel',
    ).toEqual([])
  })

  test('migracija odvzame pravico izvajanja vsem razen service_role', () => {
    for (const vloga of ['public', 'anon', 'authenticated']) {
      expect(migracija, `manjka revoke za ${vloga}`).toContain(`from ${vloga}`)
    }
    expect(migracija).toContain('to service_role')
  })

  test('migracija zavrne oba primera, ki bi pokvarila zapisan rezultat', () => {
    expect(migracija, 'manjka zavrnitev skupne prijave na turnir').toContain('sama s seboj')
    expect(migracija, 'manjka zavrnitev skupne postave v zapisniku').toContain('postavila dvakrat')
  })
})
