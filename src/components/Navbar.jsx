import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import NotificationBell from './NotificationBell'

export default function Navbar() {
  const { signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <NavLink to="/" className="brand">
          <span className="brand-dot" />
          BG Session
        </NavLink>

        <NavLink to="/" end className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          Browse
        </NavLink>
        <NavLink to="/my-sessions" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          My Sessions
        </NavLink>
        <NavLink to="/create" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          + Host
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          Profile
        </NavLink>

        <NotificationBell />

        <button className="btn btn-secondary btn-sm" onClick={handleSignOut}>
          Sign out
        </button>
      </div>
    </header>
  )
}
