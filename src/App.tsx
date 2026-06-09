import { Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import GamePage from './pages/GamePage'
import Nav from './components/Nav'

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/play" element={<GamePage />} />
      </Routes>
    </div>
  )
}
