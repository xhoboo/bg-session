import { Link } from 'react-router-dom'
import NotificationBell from './NotificationBell'
import ThemeToggle from './ThemeToggle'

// Slim top utility bar: brand on the left, notifications + theme toggle on the
// right. Primary navigation lives in the BottomNav; sign-out is on the Profile
// page.
export default function Navbar() {
  return (
    <header className="top-bar">
      <Link to="/" className="brand">
        <span className="brand-dot" />
        BG Session
      </Link>
      <div className="top-bar-actions">
        <NotificationBell />
        <ThemeToggle />
      </div>
    </header>
  )
}
