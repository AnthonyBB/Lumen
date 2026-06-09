import { Routes, Route, Navigate } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import GamePage from './pages/GamePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import SettingsPage from './pages/SettingsPage'
import Nav from './components/Nav'
import { useAuth } from './hooks/useAuth'

export default function App() {
  const { isAuthenticated, token, user, setContentMode } = useAuth()

  return (
    <div className="min-h-screen flex flex-col">
      {/* Only show Nav on non-auth pages */}
      <Routes>
        <Route path="/" element={isAuthenticated ? <><Nav /><LandingPage /></> : <LoginPage />} />
        <Route path="/login" element={isAuthenticated ? <Navigate to="/play" replace /> : <LoginPage />} />
        <Route path="/register" element={isAuthenticated ? <Navigate to="/play" replace /> : <RegisterPage />} />
        {/* /play is the canonical game URL; /game is kept as an alias */}
        <Route
          path="/play"
          element={
            isAuthenticated ? (
              <>
                <Nav />
                <GamePage token={token} user={user} setContentMode={setContentMode} />
              </>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/game"
          element={isAuthenticated ? <Navigate to="/play" replace /> : <Navigate to="/" replace />}
        />
        <Route
          path="/settings"
          element={isAuthenticated ? <SettingsPage /> : <Navigate to="/" replace />}
        />
      </Routes>
    </div>
  )
}
