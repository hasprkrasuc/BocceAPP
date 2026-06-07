import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute'
import Navbar from './components/Navbar'

import Home from './pages/Home'
import { Login, Signup } from './pages/Auth'
import Profile from './pages/Profile'
import { TournamentList, TournamentDetail } from './pages/Tournament'
import { LeagueList, LeagueDetail } from './pages/League'
import { ClubList, ClubDetail } from './pages/Clubs'
import PlayerDetail from './pages/PlayerDetail'
import { Statistics, Archive } from './pages/StatsAndArchive'
import { LeagueRanking } from './pages/LeagueRanking'
import AdminDashboard from './pages/admin/AdminDashboard'
import TournamentAdmin from './pages/admin/TournamentAdmin'
import TournamentEdit from './pages/admin/TournamentEdit'
import LeagueAdmin from './pages/admin/LeagueAdmin'
import DoubleRegAdmin from './pages/admin/DoubleRegAdmin'
import ClubAdmin from './pages/admin/ClubAdmin'
import UserAdmin from './pages/admin/UserAdmin'
import LeagueMatchScoresheet from './pages/admin/LeagueMatchScoresheet'
import LeagueMatchScoresheetDemo from './pages/admin/LeagueMatchScoresheetDemo'

const queryClient = new QueryClient()

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
              <Route path="/admin/liga/tekma/:fixtureId" element={<ProtectedRoute><LeagueMatchScoresheet /></ProtectedRoute>} />
              <Route path="/admin/liga/demo" element={<AdminRoute><LeagueMatchScoresheetDemo /></AdminRoute>} />
              <Route path="/admin/klubi" element={<AdminRoute><ClubAdmin /></AdminRoute>} />
              <Route path="/admin/uporabniki" element={<AdminRoute><UserAdmin /></AdminRoute>} />
              <Route path="/admin/dvojna-registracija" element={<AdminRoute><DoubleRegAdmin /></AdminRoute>} />

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
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
