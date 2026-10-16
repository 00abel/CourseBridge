// components/TopBar.jsx: the header shown on every signed-in page.

import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import Brand from './Brand.jsx'

export default function TopBar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <header className="topbar">
      <button className="link-btn" onClick={() => navigate('/dashboard')} aria-label="Go to dashboard">
        <Brand />
      </button>
      <div className="topbar-actions">
        <span className="topbar-email">{user?.email}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/config')}>Settings</button>
        <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Log out</button>
      </div>
    </header>
  )
}
