import { Routes, Route, Navigate } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import GamePage from './pages/GamePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import Nav from './components/Nav'
import { useAuth } from './hooks/useAuth'

export default function App() {
  const { isAuthenticated, token } = useAuth()

  return (
    <div className="min-h-screen flex flex-col">
      {/* Only show Nav on non-auth pages */}
      <Routes>
        <Route path="/" element={isAuthenticated ? <><Nav /><LandingPage /></> : <LoginPage />} />
        <Route path="/login" element={isAuthenticated ? <Navigate to="/game" replace /> : <LoginPage />} />
        <Route path="/register" element={isAuthenticated ? <Navigate to="/game" replace /> : <RegisterPage />} />
        <Route
          path="/game"
          element={
            <>
              <Nav />
              <GamePage token={token} />
            </>
          }
        />
      </Routes>
    </div>
  )
}
