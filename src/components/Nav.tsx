import { Link, useLocation } from 'react-router-dom'

export default function Nav() {
  const { pathname } = useLocation()

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
          to="/play"
          className={`text-sm font-medium transition-colors ${
            pathname === '/play' ? 'text-lumen-gold' : 'text-gray-400 hover:text-white'
          }`}
        >
          Play
        </Link>
        <Link
          to="/play"
          className="px-4 py-2 rounded-lg bg-lumen-violet hover:bg-purple-600 text-sm font-semibold transition-colors"
        >
          Play Now
        </Link>
      </div>
    </nav>
  )
}
