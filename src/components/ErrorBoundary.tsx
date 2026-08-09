import React from 'react'
import { jeNapakaSvezenja, smemoOsveziti } from '../lib/napakaSvezenja'

/**
 * Lovilec napak nad celotno aplikacijo.
 *
 * Dvoje opravi:
 *
 * 1. NAPAKA SVEŽNJA PO OBJAVI — zavihek, odprt od pred objave, drži stara imena
 *    datotek; ob odpiranju admin strani se leni uvoz ne najde in React vrže
 *    napako. Brez lovilca React odklopi celo drevo in ostane bel ekran. Tu tak
 *    primer prepoznamo in stran enkrat samodejno osvežimo — uporabnik vidi le
 *    kratek utrip, ne belega ekrana.
 *
 * 2. VSAKA DRUGA NAPAKA — namesto belega ekrana pokažemo sporočilo z gumbom.
 *    Bel ekran je najslabši možni izid: uporabnik ne ve, ali stran ne dela ali
 *    se še nalaga, in ne ve, kaj naj naredi.
 */

const KLJUC_ZADNJE_OSVEZITVE = 'balinar:zadnja-osvezitev-po-objavi'

function preberiZadnjoOsvezitev(): number | null {
  try {
    const v = window.sessionStorage.getItem(KLJUC_ZADNJE_OSVEZITVE)
    return v === null ? null : Number(v)
  } catch {
    // Safari v zasebnem načinu zna vreči napako; takrat pač brez varovala.
    return null
  }
}

function zapisiZadnjoOsvezitev(cas: number): void {
  try {
    window.sessionStorage.setItem(KLJUC_ZADNJE_OSVEZITVE, String(cas))
  } catch { /* brez shrambe gre tudi, le varovalo ne deluje */ }
}

/**
 * Osveži stran, kadar je vzrok stara objava. Vrne true, če je osvežitev
 * sprožena. Uporablja tudi poslušalec `vite:preloadError` v main.tsx.
 */
export function osveziObStariObjavi(napaka: unknown): boolean {
  if (!jeNapakaSvezenja(napaka)) return false
  const zdaj = Date.now()
  if (!smemoOsveziti(preberiZadnjoOsvezitev(), zdaj)) return false
  zapisiZadnjoOsvezitev(zdaj)
  window.location.reload()
  return true
}

interface Props { children: React.ReactNode }
interface State { napaka: unknown }

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { napaka: null }

  static getDerivedStateFromError(napaka: unknown): State {
    return { napaka }
  }

  componentDidCatch(napaka: unknown): void {
    // Ob stari objavi osvežimo; sicer pustimo napako viden v konzoli, da je
    // razvijalec ne zgreši.
    if (!osveziObStariObjavi(napaka)) {
      console.error('Napaka v aplikaciji:', napaka)
    }
  }

  render() {
    if (this.state.napaka === null) return this.props.children

    const staraObjava = jeNapakaSvezenja(this.state.napaka)
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="text-5xl mb-4">{staraObjava ? '🔄' : '⚠️'}</div>
        <h1 className="text-xl font-bold text-gray-700 mb-2">
          {staraObjava ? 'Aplikacija je bila posodobljena' : 'Nekaj je šlo narobe'}
        </h1>
        <p className="text-sm text-gray-500 mb-5 max-w-md">
          {staraObjava
            ? 'Ta zavihek je bil odprt pred posodobitvijo. Osvežite stran, da naložite novo različico.'
            : 'Strani ni bilo mogoče prikazati. Poskusite osvežiti; če se ponovi, sporočite, kaj ste počeli.'}
        </p>
        <div className="flex gap-2">
          <button onClick={() => window.location.reload()}
            className="bg-bocce-green text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-bocce-green-light">
            Osveži stran
          </button>
          <a href="/" className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
            Domov
          </a>
        </div>
      </div>
    )
  }
}
