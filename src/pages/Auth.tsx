import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { sl } from '../i18n/sl'

export function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      navigate(from, { replace: true })
    } catch {
      setError('Napačen email ali geslo')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-4xl">🎯</span>
          <h1 className="text-2xl font-bold text-gray-800 mt-2">Prijava</h1>
          <p className="text-gray-500 text-sm mt-1">Vstopi v BalinarApp</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{sl.auth.email}</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-bocce-green focus:border-transparent outline-none"
              placeholder="ime@email.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{sl.auth.password}</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-bocce-green focus:border-transparent outline-none"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-bocce-green text-white py-2.5 rounded-lg font-semibold hover:bg-bocce-green-light transition-colors disabled:opacity-50"
          >
            {loading ? 'Prijavljam...' : sl.auth.login}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          {sl.auth.noAccount}{' '}
          <Link to="/registracija" className="text-bocce-green font-medium hover:underline">
            Registriraj se
          </Link>
        </p>
      </div>
    </div>
  )
}

interface SignupForm { email: string; password: string; fullName: string; club: string }

export function Signup() {
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState<SignupForm>({ email: '', password: '', fullName: '', club: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  function set(field: keyof SignupForm) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) { setError('Geslo mora imeti vsaj 8 znakov'); return }
    setLoading(true)
    try {
      await signUp(form.email, form.password, form.fullName, form.club)
      setSuccess(true)
    } catch (err) {
      setError((err as Error).message ?? 'Napaka pri registraciji')
      setLoading(false)
    }
  }

  if (success) return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">✉️</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Preveri e-pošto</h2>
        <p className="text-gray-500">Poslali smo ti potrditveno sporočilo. Po potrditvi se lahko prijaviš.</p>
        <Link to="/prijava" className="inline-block mt-4 text-bocce-green font-medium hover:underline">
          Na stran za prijavo →
        </Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-4xl">🎯</span>
          <h1 className="text-2xl font-bold text-gray-800 mt-2">{sl.auth.register}</h1>
          <p className="text-gray-500 text-sm mt-1">Ustvari nov račun</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{sl.auth.fullName} *</label>
            <input type="text" required value={form.fullName} onChange={set('fullName')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-bocce-green outline-none"
              placeholder="Janez Novak" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{sl.auth.email} *</label>
            <input type="email" required value={form.email} onChange={set('email')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-bocce-green outline-none"
              placeholder="ime@email.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{sl.auth.password} *</label>
            <input type="password" required value={form.password} onChange={set('password')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-bocce-green outline-none"
              placeholder="Vsaj 8 znakov" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{sl.auth.club}</label>
            <input type="text" value={form.club} onChange={set('club')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-bocce-green outline-none"
              placeholder="Naziv kluba" />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>
          )}

          <button type="submit" disabled={loading}
            className="w-full bg-bocce-green text-white py-2.5 rounded-lg font-semibold hover:bg-bocce-green-light transition-colors disabled:opacity-50">
            {loading ? 'Ustvarjam račun...' : sl.auth.register}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          {sl.auth.hasAccount}{' '}
          <Link to="/prijava" className="text-bocce-green font-medium hover:underline">Prijavi se</Link>
        </p>
      </div>
    </div>
  )
}
