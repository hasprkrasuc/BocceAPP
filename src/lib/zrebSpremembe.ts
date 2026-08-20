/**
 * Preslikava dokončanega stanja žreba v spremembe vrstic `league_teams`.
 *
 * Čisto — brez uvoza `supabase.ts` — da je preverljivo s testi brez podatkov
 * za povezavo z bazo (glej `zrebSpremembe.test.ts`). Zapis sam živi v
 * `zrebShrani.ts`, ki to datoteko uvozi in ponovno izvozi.
 */
import { PREDAL_SKUPINE, PREDAL_A, PREDAL_B, type LigaEkipa, type LigaNastavitve } from '../engines/zrebLiga'
import type { ZrebStanje } from '../engines/zreb'

export interface LigaskoIzhodisce {
  nastavitve: LigaNastavitve
  ekipe: LigaEkipa[]
  /**
   * Nosilni vrstni red (id-ji ekip) za format 'groups'; za 'flat' in 'split'
   * prazen, ker se ne uporablja.
   *
   * `naloziLigaskiZreb` ga VEDNO vrne praznega — samodejno polnjenje iz
   * lestvice pretekle sezone je namenoma izven obsega, zaslon obreda pa ga
   * zbere od uporabnika (ali ga uvozi od drugod). Za format 'groups' ga mora
   * klicatelj obvezno nastaviti PRED začetkom obreda in ga posredovati
   * `preveriIzvedljivost` — prazen ali krnjen seznam pri tem formatu tiho
   * pade nazaj na abecedni vrstni red ekip, kar je napačno in ga nobeno
   * preverjanje med obredom ne zazna (glej dokumentacijski komentar
   * `preveriIzvedljivost` v `zrebLiga.ts`).
   */
  nosilniVrstniRed: string[]
  imeSezone: string
}

/** Vrstica, ki bo posodobljena — za predogled pred zapisom. */
export interface Sprememba {
  id: string
  ime: string
  draw_number: number
  group_label: 'A' | 'B' | null
}

/** Iz končanega stanja izpelje seznam sprememb. Brez I/O — da ga zaslon pokaže. */
export function spremembe(
  izhodisce: LigaskoIzhodisce, stanje: ZrebStanje,
): Sprememba[] {
  const ime = new Map(izhodisce.ekipe.map(e => [e.id, e.ime]))
  if (izhodisce.nastavitve.format !== 'groups') {
    return Object.entries(stanje.dodeljene[PREDAL_SKUPINE] ?? {}).map(([id, n]) => ({
      id, ime: ime.get(id) ?? id, draw_number: n, group_label: null,
    }))
  }
  const out: Sprememba[] = []
  for (const [predal, oznaka] of [[PREDAL_A, 'A'], [PREDAL_B, 'B']] as const) {
    for (const [id, n] of Object.entries(stanje.dodeljene[predal] ?? {})) {
      out.push({ id, ime: ime.get(id) ?? id, draw_number: n, group_label: oznaka })
    }
  }
  return out
}
