import { Link, NavLink, useNavigate } from 'react-router-dom'
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
      <div className="topbar-inner">
        <Link to="/dashboard" aria-label="Go to dashboard" style={{ textDecoration: 'none' }}>
          <Brand />
        </Link>
        <nav className="topbar-nav" aria-label="Main">
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/config">Connections</NavLink>
        </nav>
        <div className="topbar-actions">
          <span className="topbar-email">{user?.email}</span>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Log out</button>
        </div>
      </div>
    </header>
  )
}
