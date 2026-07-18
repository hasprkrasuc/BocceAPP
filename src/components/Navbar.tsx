import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { sl } from '../i18n/sl'

export default function Navbar() {
  const { user, profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleLogout() {
    await signOut()
    navigate('/')
    setMenuOpen(false)
  }

  const links: Array<{ to: string; label: string; activeOn?: string[] }> = [
    { to: '/', label: sl.nav.home },
    { to: '/klubi', label: sl.nav.clubs },
    { to: '/turnirji', label: sl.nav.tournaments },
    { to: '/prvenstva', label: sl.nav.championships },
    { to: '/serije', label: sl.nav.series, activeOn: ['/serija'] },
    { to: '/liga', label: sl.nav.league },
    { to: '/statistika', label: sl.nav.statistics },
    { to: '/arhiv', label: sl.nav.archive },
    { to: '/rang', label: sl.nav.ranking },
    { to: '/koledar', label: sl.nav.calendar },
  ]

  const matchPath = (p: string): boolean => p === '/'
    ? location.pathname === '/'
    : location.pathname.startsWith(p)
  const isActive = (path: string, activeOn: string[] = []): boolean =>
    [path, ...activeOn].some(matchPath)

  return (
    <nav className="bg-bocce-green shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center bg-white rounded-xl px-2 py-1 shadow-sm">
            <img src="/balinarapp-logo.png" alt="BalinarApp" className="h-8 w-auto max-w-[160px]" />
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {links.map(l => (
              <Link
                key={l.to}
                to={l.to}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive(l.to, l.activeOn)
                    ? 'bg-bocce-green-dark text-white'
                    : 'text-green-100 hover:bg-bocce-green-light hover:text-white'
                }`}
              >
                {l.label}
              </Link>
            ))}

            {isAdmin && (
              <Link
                to="/admin"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive('/admin')
                    ? 'bg-bocce-gold text-white'
                    : 'text-bocce-gold-light hover:bg-bocce-gold hover:text-white'
                }`}
              >
                {sl.nav.admin}
              </Link>
            )}
          </div>

          {/* Auth area */}
          <div className="hidden md:flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-3">
                <Link
                  to="/profil"
                  className="text-green-100 hover:text-white text-sm font-medium"
                >
                  {profile?.full_name ?? user.email}
                </Link>
                <button
                  onClick={handleLogout}
                  className="bg-white/10 hover:bg-white/20 text-white text-sm px-3 py-1.5 rounded-md transition-colors"
                >
                  {sl.nav.logout}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Link
                  to="/prijava"
                  className="text-green-100 hover:text-white text-sm font-medium px-3 py-1.5"
                >
                  {sl.nav.login}
                </Link>
                <Link
                  to="/registracija"
                  className="bg-bocce-gold hover:bg-bocce-gold-light text-white text-sm font-medium px-3 py-1.5 rounded-md transition-colors"
                >
                  {sl.nav.register}
                </Link>
              </div>
            )}
          </div>

          {/* Mobile burger */}
          <button
            className="md:hidden text-white p-2 rounded-md hover:bg-bocce-green-light"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Odpri meni"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              }
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-bocce-green-dark border-t border-bocce-green-light">
          <div className="px-4 py-3 space-y-1">
            {links.map(l => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setMenuOpen(false)}
                className={`block px-3 py-2 rounded-md text-sm font-medium ${
                  isActive(l.to, l.activeOn) ? 'bg-bocce-green text-white' : 'text-green-100 hover:bg-bocce-green'
                }`}
              >
                {l.label}
              </Link>
            ))}
            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => setMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-sm font-medium text-bocce-gold-light hover:bg-bocce-green"
              >
                {sl.nav.admin}
              </Link>
            )}
            <div className="pt-2 border-t border-bocce-green">
              {user ? (
                <>
                  <Link to="/profil" onClick={() => setMenuOpen(false)} className="block px-3 py-2 text-sm text-green-100 hover:text-white">
                    {profile?.full_name ?? user.email}
                  </Link>
                  <button onClick={handleLogout} className="block w-full text-left px-3 py-2 text-sm text-green-100 hover:text-white">
                    {sl.nav.logout}
                  </button>
                </>
              ) : (
                <>
                  <Link to="/prijava" onClick={() => setMenuOpen(false)} className="block px-3 py-2 text-sm text-green-100 hover:text-white">
                    {sl.nav.login}
                  </Link>
                  <Link to="/registracija" onClick={() => setMenuOpen(false)} className="block px-3 py-2 text-sm text-bocce-gold-light hover:text-white">
                    {sl.nav.register}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
