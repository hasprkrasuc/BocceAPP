import { Navigate, useLocation } from 'react-router-dom'
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

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner />
  if (!user) return <Navigate to="/prijava" state={{ from: location }} replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}
