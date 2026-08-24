/**
 * Grb kluba ob imenu ekipe.
 *
 * Logotip pride iz kluba (`clubs.logo_url`), na ekipo pa je vezan prek
 * `league_teams.club_id`. Ekipe brez te povezave in klubi brez naložene slike
 * so povsem običajni — takrat se izriše krogec z začetnicami, da vrstica ne
 * poskoči in da se ekipe med sabo še vedno ločijo na prvi pogled.
 */

interface Props {
  /** Ime ekipe, kakor je prijavljena — iz njega so začetnice, kadar logotipa ni. */
  ime: string | null | undefined
  logoUrl?: string | null
  velikost?: 'sm' | 'md' | 'lg'
  className?: string
}

const MERE = {
  sm: 'w-5 h-5 text-[9px]',
  md: 'w-7 h-7 text-[10px]',
  lg: 'w-10 h-10 text-xs',
} as const

/** Do dve začetnici; enobesedno ime da prvi dve črki, da »Breza« ni samo »B«. */
export function zacetnice(ime: string | null | undefined): string {
  const besede = (ime || '').split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (besede.length === 0) return '?'
  if (besede.length === 1) return besede[0].slice(0, 2).toUpperCase()
  return (besede[0][0] + besede[1][0]).toUpperCase()
}

export default function KlubskiGrb({ ime, logoUrl, velikost = 'md', className = '' }: Props) {
  const mere = MERE[velikost]
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        aria-hidden="true"
        className={`${mere} rounded-full object-contain bg-white border border-gray-200 shrink-0 ${className}`}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={`${mere} rounded-full bg-gray-100 border border-gray-200 text-gray-500 font-semibold
                  flex items-center justify-center shrink-0 select-none ${className}`}
    >
      {zacetnice(ime)}
    </span>
  )
}
