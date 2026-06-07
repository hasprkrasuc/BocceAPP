import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function AdminDashboard() {
  const { isSuperAdmin } = useAuth()

  const cards = [
    {
      to: '/admin/klubi',
      icon: '🏛️',
      title: 'Upravljanje klubov',
      desc: 'Dodaj klube, logotipe, ekipne fotografije in kontaktne podatke',
      color: 'border-bocce-lime hover:bg-bocce-lime/5',
    },
    {
      to: '/admin/turnirji',
      icon: '🏆',
      title: 'Turnirji & Prvenstva',
      desc: 'Ustvari turnirje, odpri prijave, naredi žreb skupin, vodi rezultate',
      color: 'border-bocce-green hover:bg-bocce-green/5',
    },
    {
      to: '/admin/liga',
      icon: '⚽',
      title: 'Državne lige',
      desc: 'Sezone, ekipe, razpored krogov, vnos rezultatov',
      color: 'border-bocce-gold hover:bg-bocce-gold/5',
    },
    ...(isSuperAdmin ? [{
      to: '/admin/uporabniki',
      icon: '👤',
      title: 'Upravljanje uporabnikov',
      desc: 'Pregled registriranih igralcev, dodelitev vlog, slike',
      color: 'border-purple-300 hover:bg-purple-50',
    }] : []),
  ]

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Administracija</h1>
      <p className="text-sm text-gray-500 mb-8">Upravljanje turnirjev in državnega ekipnega prvenstva</p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(c => (
          <Link key={c.to} to={c.to}
            className={`bg-white border-2 rounded-2xl p-6 transition-all hover:shadow-md ${c.color}`}>
            <div className="text-3xl mb-3">{c.icon}</div>
            <h2 className="font-semibold text-gray-800 mb-1">{c.title}</h2>
            <p className="text-sm text-gray-500">{c.desc}</p>
          </Link>
        ))}
      </div>

      {/* Quick links */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Hitre povezave</h2>
        <div className="flex flex-wrap gap-3">
          <Link to="/klubi" className="text-sm text-bocce-green hover:underline">Klubi →</Link>
          <Link to="/turnirji" className="text-sm text-bocce-green hover:underline">Turnirji →</Link>
          <Link to="/liga" className="text-sm text-bocce-green hover:underline">Državne lige →</Link>
          <Link to="/statistika" className="text-sm text-bocce-green hover:underline">Statistika →</Link>
        </div>
      </div>
    </div>
  )
}
