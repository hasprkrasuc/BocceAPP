import React, { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams, Link } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ProtectedRoute, AdminRoute, LeagueAdminRoute, ClubAdminRoute } from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import ErrorBoundary from './components/ErrorBoundary'
import ChangePassword from './pages/ChangePassword'

import Home from './pages/Home'
import { Login, Signup } from './pages/Auth'
import PozabljenoGeslo from './pages/PozabljenoGeslo'
import NovoGeslo from './pages/NovoGeslo'
import Profile from './pages/Profile'
import Pokal from './pages/Pokal'
import { TournamentList, TournamentDetail } from './pages/Tournament'
import { LeagueList, LeagueDetail } from './pages/League'
import { ClubList, ClubDetail } from './pages/Clubs'
import PlayerDetail from './pages/PlayerDetail'
import { Statistics, Archive } from './pages/StatsAndArchive'
import { LeagueRanking } from './pages/LeagueRanking'
import Calendar from './pages/Calendar'
import Series from './pages/Series'
import Zasebnost from './pages/Zasebnost'

// ── Strani iz pages/admin/ se naložijo šele ob obisku ───────────────
//
// Prej so bile uvožene statično in so pristale v glavnem svežnju, torej jih
// je prenesel VSAK obiskovalec — tudi neprijavljen gledalec lestvice, ki
// administracije ne bo nikoli odprl. Skupaj merijo ~244 kB izvorne kode.
//
// LeagueMatchScoresheet je tu posebnost: leži v admin/, a visi na JAVNI poti
// /liga/tekma/:fixtureId. Lena je vseeno, ker je ne potrebuje domača stran —
// pomembno pa je, da ostane samostojna in ne pristane v admin svežnju, sicer
// bi jo javna pot vlekla skupaj z administracijo.
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const TournamentAdmin = lazy(() => import('./pages/admin/TournamentAdmin'))
const TournamentEdit = lazy(() => import('./pages/admin/TournamentEdit'))
const ZivZreb = lazy(() => import('./pages/admin/ZivZreb'))
const LeagueAdmin = lazy(() => import('./pages/admin/LeagueAdmin'))
const MojKlub = lazy(() => import('./pages/admin/MojKlub'))
const DoubleRegAdmin = lazy(() => import('./pages/admin/DoubleRegAdmin'))
const ClubAdmin = lazy(() => import('./pages/admin/ClubAdmin'))
const UserAdmin = lazy(() => import('./pages/admin/UserAdmin'))
const LeagueMatchScoresheet = lazy(() => import('./pages/admin/LeagueMatchScoresheet'))
const LeagueMatchScoresheetDemo = lazy(() => import('./pages/admin/LeagueMatchScoresheetDemo'))
const SeriesAdmin = lazy(() => import('./pages/admin/SeriesAdmin'))
const SeriesEdit = lazy(() => import('./pages/admin/SeriesEdit'))
const PlayerImport = lazy(() => import('./pages/admin/PlayerImport'))
const GuestAdmin = lazy(() => import('./pages/admin/GuestAdmin'))

const queryClient = new QueryClient()

/** Prikaže se med prenosom leno naložene strani. */
function NalaganjeStrani() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] text-gray-400 text-sm">
      Nalagam…
    </div>
  )
}

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
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <span>BalinarApp © {new Date().getFullYear()}</span>
          <span aria-hidden="true">·</span>
          <Link to="/zasebnost" className="hover:text-bocce-green hover:underline">
            Zasebnost in piškotki
          </Link>
        </div>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/* Zunanji lovilec je zadnja obramba: notranji (v Layoutu) ne more
            ujeti napake iz AuthProvider ali RequirePasswordChange, ker sta
            NAD njim. Brez tega bi napaka v prijavi ali preusmeritvi gesla
            spet dala bel ekran. */}
        <ErrorBoundary>
        <AuthProvider>
          <RequirePasswordChange>
          <Layout>
            {/* Lovilec je ZNOTRAJ Layouta, da ob napaki ostane navigacija in
                se uporabnik lahko premakne drugam. Zunaj Suspensa je zato, ker
                mora ujeti tudi zavrnjen leni uvoz, ki ga Suspense vrže naprej. */}
            <ErrorBoundary>
            <Suspense fallback={<NalaganjeStrani />}>
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
              <Route path="/pokal" element={<Pokal />} />
              <Route path="/statistika" element={<Statistics />} />
              <Route path="/arhiv" element={<Archive />} />
              <Route path="/rang" element={<LeagueRanking />} />
              <Route path="/koledar" element={<Calendar />} />
              <Route path="/serije" element={<Series />} />
              <Route path="/serija/:id" element={<Series />} />
              <Route path="/zasebnost" element={<Zasebnost />} />
              <Route path="/liga/tekma/:fixtureId" element={<LeagueMatchScoresheet />} />

              {/* Auth */}
              <Route path="/prijava" element={<Login />} />
              <Route path="/registracija" element={<Signup />} />
              {/* Ponastavitev gesla je javna po naravi — do nje pride človek,
                  ki se prav zato ne more prijaviti. */}
              <Route path="/pozabljeno-geslo" element={<PozabljenoGeslo />} />
              <Route path="/novo-geslo" element={<NovoGeslo />} />

              {/* Protected (logged in) */}
              <Route path="/profil" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

              {/* Admin */}
              <Route path="/admin" element={<LeagueAdminRoute><AdminDashboard /></LeagueAdminRoute>} />
              <Route path="/admin/turnirji" element={<AdminRoute><TournamentAdmin /></AdminRoute>} />
              <Route path="/admin/turnir/:id" element={<AdminRoute><TournamentEdit /></AdminRoute>} />
              <Route path="/admin/turnir/:id/zreb" element={<AdminRoute><ZivZreb /></AdminRoute>} />
              <Route path="/admin/liga" element={<LeagueAdminRoute><LeagueAdmin /></LeagueAdminRoute>} />
              <Route path="/admin/uvoz-igralcev" element={<AdminRoute><PlayerImport /></AdminRoute>} />
              <Route path="/admin/liga/tekma/:fixtureId" element={<OldScoresheetRedirect />} />
              <Route path="/admin/liga/demo" element={<AdminRoute><LeagueMatchScoresheetDemo /></AdminRoute>} />
              <Route path="/admin/moj-klub" element={<ClubAdminRoute><MojKlub /></ClubAdminRoute>} />
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
            </Suspense>
            </ErrorBoundary>
          </Layout>
          </RequirePasswordChange>
        </AuthProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
