import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Nav() {
  const { pathname } = useLocation()
  const { user, logout } = useAuth()

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4 bg-lumen-dark/80 backdrop-blur-sm border-b border-white/10">
      <Link to="/" className="font-display text-xl font-bold text-lumen-gold tracking-widest">
        LUMEN
      </Link>

      <div className="flex items-center gap-6">
        <Link
          to="/"
          className={`text-sm font-medium transition-colors ${
            pathname === '/' ? 'text-lumen-gold' : 'text-gray-400 hover:text-white'
          }`}
        >
          Home
        </Link>

        <Link
          to="/settings"
          className={`text-sm font-medium transition-colors ${
            pathname === '/settings' ? 'text-lumen-gold' : 'text-gray-400 hover:text-white'
          }`}
        >
          Settings
        </Link>

        {/* Divider */}
        <span className="h-4 w-px bg-white/10" />

        {/* Username chip */}
        {user && (
          <span className="flex items-center gap-2 text-sm">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-lumen-violet/30 text-lumen-gold text-xs font-bold">
              {user.username.charAt(0).toUpperCase()}
            </span>
            <span className="text-gray-300 font-medium">{user.username}</span>
            {user.contentMode && (
              <span className="text-xs text-gray-500 hidden sm:inline">
                {user.contentMode === 'adolescent' ? '⚔️' : '🌟'}
              </span>
            )}
          </span>
        )}

        <Link
          to="/play"
          className="px-4 py-2 rounded-lg bg-lumen-violet hover:bg-purple-600 text-sm font-semibold transition-colors"
        >
          Play Now
        </Link>

        {/* Sign out */}
        <button
          onClick={logout}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          title="Sign out"
        >
          Sign out
        </button>
      </div>
    </nav>
  )
}
