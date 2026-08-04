import { describe, test, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { USER_PUBLIC_COLS } from './userColumns'

// Na bazi je SELECT na public.users za vlogi anon in authenticated omejen na
// USER_PUBLIC_COLS (migracija 20260729_02_users_pii_authenticated.sql).
// Vgnezdena poizvedba, ki bere vse stolpce, zato vrne 403 "permission denied
// for table users".
//
// Zakaj ta test obstaja: 29. 7. 2026 sta ob tej omejitvi ostali dve
// spregledani poizvedbi v admin strani turnirja. Ker koda njune napake ni
// zajela, se to ni pokazalo kot napaka, ampak kot PRAZEN SEZNAM — vpisana
// prijava na turnir se preprosto ni prikazala. Odkrito je bilo šele 4. 8.,
// ko je nekdo poskusil vnesti ekipo.
//
// Test bere izvorno kodo namesto da bi klical bazo, ker mora ujeti prav to:
// poizvedbo, ki je nihče ne požene, dokler ne pride pravi uporabnik.

const here = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(here, '..')

// `users(*)` ali `users!ime_tujega_kljuca(*)`, a NE `users_sensitive(*)`
// in ne `guest_players(...)` — od tod pogled nazaj na mejo besede.
const VGNEZDEN_ZVEZDICA = /(?<![A-Za-z0-9_])users(?:![A-Za-z0-9_]+)?\(\s*\*\s*\)/

/**
 * Izloči komentarje, a ohrani število vrstic, da ostanejo številke uporabne.
 * Brez tega test lovi tudi opozorila v komentarjih, ki prav ta vzorec navajajo
 * kot napačnega — vključno s komentarjem nad popravljeno poizvedbo.
 * Pri `//` je izvzet primer, ko je pred njim dvopičje (`https://`).
 */
function brezKomentarjev(vsebina: string): string {
  return vsebina
    .replace(/\/\*[\s\S]*?\*\//g, blok => blok.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (ujem, pred) => pred + ' '.repeat(ujem.length - pred.length))
}

function vseIzvorneDatoteke(dir: string): string[] {
  return readdirSync(dir).flatMap(vnos => {
    const p = path.join(dir, vnos)
    if (statSync(p).isDirectory()) return vseIzvorneDatoteke(p)
    if (!/\.tsx?$/.test(p)) return []
    if (/\.test\.tsx?$/.test(p)) return []   // testi smejo vzorec omenjati
    return [p]
  })
}

describe('branje tabele users', () => {
  test('nobena poizvedba ne bere users z zvezdico', () => {
    const kršitve = vseIzvorneDatoteke(srcDir)
      .flatMap(datoteka =>
        brezKomentarjev(readFileSync(datoteka, 'utf8'))
          .split('\n')
          .map((vrstica, i) => ({ datoteka, vrstica: i + 1, besedilo: vrstica }))
          .filter(v => VGNEZDEN_ZVEZDICA.test(v.besedilo)),
      )
      .map(v => `${path.relative(srcDir, v.datoteka)}:${v.vrstica}`)

    expect(
      kršitve,
      `users(*) vrne 403 za authenticated. Uporabi users(\${USER_PUBLIC_COLS}) iz src/lib/userColumns.ts, `
      + `za občutljive stolpce pa pogled users_sensitive. Kršitve: ${kršitve.join(', ')}`,
    ).toEqual([])
  })

  test('USER_PUBLIC_COLS ne vsebuje občutljivih stolpcev', () => {
    const obcutljivi = ['emso', 'email', 'phone', 'address', 'license_number', 'citizenship', 'birth_city', 'date_of_birth']
    const najdeni = obcutljivi.filter(s => USER_PUBLIC_COLS.split(',').includes(s))
    expect(najdeni, `USER_PUBLIC_COLS je namenjen JAVNEMU branju: ${najdeni.join(', ')}`).toEqual([])
  })
})
