import type { UserRole } from '../types'

// Enotni vir za prikaz vlog. Prej sta obstajali dve ločeni preslikavi —
// v UserAdmin in kot vgnezdeni pogoj v Profile — in tista v Profile je
// izpustila 'judge', zato se je sodnik na svojem profilu predstavil kot
// »Igralec«. Vsak nov prikaz vloge naj bere od tod.
//
// Vloga je enovrednostna in odloča o sojenju: spustni seznam sodnikov bere
// role IN ('judge','admin','super_admin'), pravica do vpisa rezultata pa
// zahteva role === 'judge'. Kdor sodi IN igra, ima torej vlogo 'judge' —
// igranje od vloge ni odvisno, ker teče prek league_team_players.

export const ROLE_ORDER: UserRole[] = ['player', 'judge', 'admin', 'super_admin']

export const ROLE_LABELS: Record<UserRole, string> = {
  player: 'Igralec',
  judge: 'Sodnik',
  admin: 'Administrator',
  super_admin: 'Super admin',
}

export const ROLE_COLORS: Record<UserRole, string> = {
  player: 'bg-gray-100 text-gray-600',
  judge: 'bg-blue-100 text-blue-700',
  admin: 'bg-bocce-gold/20 text-bocce-gold',
  super_admin: 'bg-red-100 text-red-600',
}
