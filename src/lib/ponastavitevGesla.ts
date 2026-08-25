/**
 * PONASTAVITEV POZABLJENEGA GESLA
 *
 * Aplikacija doslej ni imela nobene poti nazaj: prijavni zaslon je ponujal le
 * prijavo in registracijo, admin pa gesla ni mogel ponastaviti. Kdor je geslo
 * pozabil, je ostal zunaj, dokler ga ni nekdo rešil iz Supabase nadzorne plošče.
 *
 * Ključna omejitev, ki je pri tej bazi ni mogoče obiti: od 1403 uporabnikov jih
 * 1370 nima pravega poštnega predala — ob uvozu so dobili naslov oblike
 * `ime.priimek.hash@balinar.app`. Ta naslov nikamor ne vodi, zato pošte s
 * povezavo za ponastavitev ni komu dostaviti. Tem uporabnikom mora geslo
 * nastaviti skrbnik; obrazec jim to pove naravnost, namesto da bi tiho
 * "poslal" pošto v nič.
 */

import { isGenericEmail } from './genericEmail'

/** Najkrajše sprejemljivo geslo. Enako kot na zaslonu za prvo prijavo. */
export const NAJMANJ_ZNAKOV = 8

/**
 * Preveri novo geslo in njegovo ponovitev. Vrne sporočilo o napaki ali null.
 * Deljeno med prisilno spremembo ob prvi prijavi in ponastavitvijo prek
 * povezave, da se pravili ne razideta.
 */
export function napakaNovegaGesla(geslo: string, ponovitev: string): string | null {
  if (geslo.length < NAJMANJ_ZNAKOV) return `Novo geslo mora imeti vsaj ${NAJMANJ_ZNAKOV} znakov`
  if (geslo !== ponovitev) return 'Gesli se ne ujemata'
  return null
}

/**
 * Opozorilo, kadar vpisani naslov ne more prejeti pošte, ali null.
 *
 * Namenoma NE pove, ali račun s tem naslovom obstaja — to bi bil seznam
 * uporabnikov za vsakogar, ki zna ugibati. Pove samo dejstvo o domeni, ki jo
 * je človek pravkar sam vtipkal.
 */
export function opozoriloOGenericnemNaslovu(email: string): string | null {
  if (!isGenericEmail(email.trim())) return null
  return 'Ta naslov je aplikacija dodelila sama ob uvozu in ne more prejeti pošte. ' +
    'Za novo geslo se obrni na skrbnika zveze — lahko pa v profilu najprej vpišeš svoj pravi e-naslov.'
}

/**
 * Sporočilo po zahtevi za ponastavitev. Enako ne glede na to, ali račun
 * obstaja: drugačno besedilo bi razkrilo, kdo je v bazi.
 */
export const SPOROCILO_POSLANO =
  'Če za ta naslov obstaja račun, je povezava za ponastavitev na poti. ' +
  'Povezava velja eno uro; če je ne dobiš, poglej še med vsiljeno pošto.'
