import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { UserProfile, UserRole } from '../../types'

const ROLE_LABELS: Record<UserRole, string> = {
  player: 'Igralec', admin: 'Administrator', super_admin: 'Super admin', judge: 'Sodnik',
}
const ROLE_COLORS: Record<UserRole, string> = {
  player: 'bg-gray-100 text-gray-600',
  admin: 'bg-bocce-gold/20 text-bocce-gold',
  super_admin: 'bg-red-100 text-red-600',
  judge: 'bg-blue-100 text-blue-700',
}

export default function UserAdmin() {
  const { isSuperAdmin } = useAuth()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('users').select('*').order('full_name')
    setUsers((data ?? []) as UserProfile[])
    setLoading(false)
  }

  async function updateRole(userId: string, role: UserRole) {
    setUpdating(userId)
    await supabase.from('users').update({ role }).eq('id', userId)
    await load()
    setUpdating(null)
  }

  const filtered = users.filter(u =>
    (roleFilter === 'all' || u.role === roleFilter) &&
    (
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      (u.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
      u.club?.toLowerCase().includes(search.toLowerCase())
    )
  )
  const roleCount = (r: UserRole) => users.filter(u => u.role === r).length

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Upravljanje uporabnikov</h1>
      <p className="text-sm text-gray-500 mb-6">{users.length} registriranih uporabnikov</p>

      <div className="mb-4 space-y-3">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-md border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-bocce-green outline-none"
          placeholder="Išči po imenu, emailu ali klubu..."
        />
        <div className="flex flex-wrap gap-2">
          {([['all', 'Vsi'], ['judge', `Sodniki (${roleCount('judge')})`], ['player', 'Igralci'], ['admin', 'Administratorji'], ['super_admin', 'Super admini']] as const).map(([r, label]) => (
            <button key={r} onClick={() => setRoleFilter(r as UserRole | 'all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                ${roleFilter === r ? 'bg-bocce-green text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-bocce-green text-white text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Ime</th>
                <th className="px-4 py-3 text-left hidden sm:table-cell">E-pošta</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">Klub</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">Licenca</th>
                <th className="px-4 py-3 text-left">Vloga</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => (
                <tr key={u.id} className={`border-b border-gray-100 hover:bg-bocce-green/5 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{u.full_name}</div>
                    <div className="text-xs text-gray-400 sm:hidden">{u.email}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{u.email}</td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{u.club ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs hidden md:table-cell">{u.license_number ?? '—'}</td>
                  <td className="px-4 py-3">
                    {isSuperAdmin ? (
                      <select
                        value={u.role}
                        disabled={updating === u.id}
                        onChange={e => updateRole(u.id, e.target.value as UserRole)}
                        className={`text-xs px-2 py-1 rounded-full border-0 font-medium cursor-pointer ${ROLE_COLORS[u.role]}`}
                      >
                        <option value="player">Igralec</option>
                        <option value="admin">Administrator</option>
                        <option value="super_admin">Super admin</option>
                      </select>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role]}`}>
                        {ROLE_LABELS[u.role]}
                      </span>
                    )}
                    {updating === u.id && <span className="ml-2 text-xs text-gray-400">...</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-8 text-gray-400 italic">Ni zadetkov</div>
          )}
        </div>
      )}
    </div>
  )
}
