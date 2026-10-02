import { Navigate, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const Spinner = () => (
  <div className="flex items-center justify-center min-h-[40vh]">
    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-bocce-green" />
  </div>
)

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner />
  if (!user) return <Navigate to="/prijava" state={{ from: location }} replace />
  return <>{children}</>
}

/**
 * Ligaški admin: globalni admin ALI admin vsaj ene sezone.
 * Namenoma ločeno od AdminRoute — ligaški admin ne sme do klubov, uporabnikov
 * in turnirjev, samo do svoje lige. Zapora tu je le udobje; resnično mejo
 * postavljajo RLS politike (is_league_admin), ki jih odjemalec ne more obiti.
 */
export function LeagueAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, isLeagueAdmin, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner />
  if (!user) return <Navigate to="/prijava" state={{ from: location }} replace />
  if (!isAdmin && !isLeagueAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

/**
 * Klubski skrbnik: globalni admin ALI skrbnik vsaj enega kluba.
 *
 * Enako kot pri ligaškem: zapora tu je le udobje. Resnično mejo postavljata
 * pogled `club_members` in straža v api/club-member.ts, ki ju odjemalec ne
 * more obiti — kdor bi pot odprl na silo, bi videl prazen seznam.
 */
export function ClubAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, isClubAdmin, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner />
  if (!user) return <Navigate to="/prijava" state={{ from: location }} replace />
  if (!isAdmin && !isClubAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

/**
 * Urejanje enega tekmovanja: globalni admin ALI glavni sodnik TEGA tekmovanja.
 *
 * Drugače kot pri ligaški in klubski zapori tu preverimo tudi `:id` — sodnik
 * enega prvenstva ne sme odpreti drugega. Tudi to je le udobje; resnično mejo
 * postavlja `is_tournament_judge()` v RLS politikah, ki jih odjemalec ne more
 * obiti. Sodnik v tem zaslonu vidi le toliko, kolikor mu dovoli baza: pri
 * izbijanju sta to prijave in grafikon, samega tekmovanja pa ne more urejati,
 * ker je UPDATE na `tournaments` še naprej le za admina.
 */
export function TournamentEditRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, managedTournamentIds, loading } = useAuth()
  const location = useLocation()
  const { id } = useParams<{ id: string }>()

  if (loading) return <Spinner />
  if (!user) return <Navigate to="/prijava" state={{ from: location }} replace />
  if (!isAdmin && !(id && managedTournamentIds.includes(id))) return <Navigate to="/" replace />
  return <>{children}</>
}

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner />
  if (!user) return <Navigate to="/prijava" state={{ from: location }} replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}
