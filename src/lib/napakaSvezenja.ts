/**
 * Prepoznavanje napake "svežnja ni več na strežniku".
 *
 * Admin strani se nalagajo leno (`lazy(() => import(...))`), Vite pa ob vsaki
 * objavi datotekam spremeni zgoščeno ime. Zavihek, ki je odprt od prej, drži v
 * pomnilniku STARI `index.html` in z njim stara imena svežnjev. Po objavi teh
 * datotek ni več — uvoz vrne 404, obljuba se zavrne in React vrže napako med
 * izrisom.
 *
 * Brez lovilca napak React 18 v takem primeru odklopi celotno drevo, zato
 * ostane BEL EKRAN. Osvežitev naloži nov `index.html` z novimi imeni in vse
 * spet dela — natanko to, kar so opažali uporabniki.
 *
 * Tu je samo prepoznava; ravnanje je v components/ErrorBoundary.tsx.
 */

/** Sporočila, ki jih ob manjkajočem svežnju vrnejo posamezni brskalniki. */
const VZORCI = [
  /failed to fetch dynamically imported module/i,   // Chrome, Edge
  /error loading dynamically imported module/i,     // Firefox
  /importing a module script failed/i,              // Safari
  /unable to preload css/i,                         // Vite, manjkajoč slog
  /chunkloaderror/i,                                // starejši svežnjarji
  /loading chunk \S+ failed/i,
  /dynamically imported module.*(404|not found)/i,
]

/** Ali je napaka posledica tega, da svežnja ni več na strežniku. */
export function jeNapakaSvezenja(napaka: unknown): boolean {
  if (napaka == null) return false
  const besedilo = napaka instanceof Error
    ? `${napaka.name}: ${napaka.message}`
    : String(napaka)
  return VZORCI.some(v => v.test(besedilo))
}

/** Najmanjši razmik med samodejnima osvežitvama (ms). */
export const RAZMIK_OSVEZITVE_MS = 10_000

/**
 * Ali smemo stran samodejno osvežiti.
 *
 * Varovalo pred zanko: če osvežitev napake ne odpravi (na primer zato, ker
 * sveženj res manjka in ne gre za staro objavo), bi se stran osveževala v
 * neskončnost. Zato dovolimo eno osvežitev na razmik; ob naslednji objavi čez
 * nekaj ur pa spet, ker je razmik takrat davno pretekel.
 *
 * @param zadnjaOsvezitev čas prejšnje samodejne osvežitve (ms) ali null
 * @param zdaj            trenutni čas (ms)
 */
export function smemoOsveziti(
  zadnjaOsvezitev: number | null,
  zdaj: number,
  razmik: number = RAZMIK_OSVEZITVE_MS,
): boolean {
  if (zadnjaOsvezitev === null || !Number.isFinite(zadnjaOsvezitev)) return true
  return zdaj - zadnjaOsvezitev >= razmik
}
