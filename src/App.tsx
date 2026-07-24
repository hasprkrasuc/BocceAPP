import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import ChangePassword from './pages/ChangePassword'

import Home from './pages/Home'
import { Login, Signup } from './pages/Auth'
import Profile from './pages/Profile'
import { TournamentList, TournamentDetail } from './pages/Tournament'
import { LeagueList, LeagueDetail } from './pages/League'
import { ClubList, ClubDetail } from './pages/Clubs'
import PlayerDetail from './pages/PlayerDetail'
import { Statistics, Archive } from './pages/StatsAndArchive'
import { LeagueRanking } from './pages/LeagueRanking'
import Calendar from './pages/Calendar'
import AdminDashboard from './pages/admin/AdminDashboard'
import TournamentAdmin from './pages/admin/TournamentAdmin'
import TournamentEdit from './pages/admin/TournamentEdit'
import LeagueAdmin from './pages/admin/LeagueAdmin'
import DoubleRegAdmin from './pages/admin/DoubleRegAdmin'
import ClubAdmin from './pages/admin/ClubAdmin'
import UserAdmin from './pages/admin/UserAdmin'
import LeagueMatchScoresheet from './pages/admin/LeagueMatchScoresheet'
import LeagueMatchScoresheetDemo from './pages/admin/LeagueMatchScoresheetDemo'
import Series from './pages/Series'
import SeriesAdmin from './pages/admin/SeriesAdmin'
import SeriesEdit from './pages/admin/SeriesEdit'
import PlayerImport from './pages/admin/PlayerImport'
import GuestAdmin from './pages/admin/GuestAdmin'

const queryClient = new QueryClient()

// Zapisnik je zdaj javna stran (glej /liga/tekma/:fixtureId) — stare povezave na
// /admin/liga/tekma/:fixtureId preusmerimo, da ne pokvarimo zaznamkov.
function OldScoresheetRedirect() {
  const { fixtureId } = useParams<{ fixtureId: string }>()
  return <Navigate to={`/liga/tekma/${fixtureId}`} replace />
}

/**
 * Prisilna sprememba gesla: če je prijavljeni uporabnik označen z
 * must_change_password, mu do spremembe gesla ne prikažemo aplikacije.
 */
function RequirePasswordChange({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth()
  if (user && profile?.must_change_password) return <ChangePassword />
  return <>{children}</>
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main>{children}</main>
      <footer className="mt-16 border-t border-gray-200 py-6 text-center text-xs text-gray-400">
        BalinarApp © {new Date().getFullYear()}
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <RequirePasswordChange>
          <Layout>
            <Routes>
              {/* Public */}
              <Route path="/" element={<Home />} />
              <Route path="/klubi" element={<ClubList />} />
              <Route path="/klubi/:id" element={<ClubDetail />} />
              <Route path="/igraci/:id" element={<PlayerDetail />} />
              <Route path="/turnirji" element={<TournamentList kind="tournament" />} />
              <Route path="/turnirji/:id" element={<TournamentDetail />} />
              <Route path="/prvenstva" element={<TournamentList kind="championship" />} />
              <Route path="/prvenstva/:id" element={<TournamentDetail />} />
              <Route path="/liga" element={<LeagueList />} />
              <Route path="/liga/:id" element={<LeagueDetail />} />
              <Route path="/statistika" element={<Statistics />} />
              <Route path="/arhiv" element={<Archive />} />
              <Route path="/rang" element={<LeagueRanking />} />
              <Route path="/koledar" element={<Calendar />} />
              <Route path="/serije" element={<Series />} />
              <Route path="/serija/:id" element={<Series />} />
              <Route path="/liga/tekma/:fixtureId" element={<LeagueMatchScoresheet />} />

              {/* Auth */}
              <Route path="/prijava" element={<Login />} />
              <Route path="/registracija" element={<Signup />} />

              {/* Protected (logged in) */}
              <Route path="/profil" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

              {/* Admin */}
              <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
              <Route path="/admin/turnirji" element={<AdminRoute><TournamentAdmin /></AdminRoute>} />
              <Route path="/admin/turnir/:id" element={<AdminRoute><TournamentEdit /></AdminRoute>} />
              <Route path="/admin/liga" element={<AdminRoute><LeagueAdmin /></AdminRoute>} />
              <Route path="/admin/uvoz-igralcev" element={<AdminRoute><PlayerImport /></AdminRoute>} />
              <Route path="/admin/liga/tekma/:fixtureId" element={<OldScoresheetRedirect />} />
              <Route path="/admin/liga/demo" element={<AdminRoute><LeagueMatchScoresheetDemo /></AdminRoute>} />
              <Route path="/admin/klubi" element={<AdminRoute><ClubAdmin /></AdminRoute>} />
              <Route path="/admin/uporabniki" element={<AdminRoute><UserAdmin /></AdminRoute>} />
              <Route path="/admin/gosti" element={<AdminRoute><GuestAdmin /></AdminRoute>} />
              <Route path="/admin/dvojna-registracija" element={<AdminRoute><DoubleRegAdmin /></AdminRoute>} />
              <Route path="/admin/serije" element={<AdminRoute><SeriesAdmin /></AdminRoute>} />
              <Route path="/admin/serija/:id" element={<AdminRoute><SeriesEdit /></AdminRoute>} />

              {/* 404 */}
              <Route path="*" element={
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
                  <div className="text-6xl mb-4">🎯</div>
                  <h1 className="text-2xl font-bold text-gray-700 mb-2">Stran ni najdena</h1>
                  <a href="/" className="text-bocce-green hover:underline">Nazaj na domačo stran</a>
                </div>
              } />
            </Routes>
          </Layout>
          </RequirePasswordChange>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
