import { Link } from 'react-router-dom'
import GlobalSearch from './GlobalSearch'
import NotificationBell from './NotificationBell'
import ThemeToggle from './ThemeToggle'
import LanguageToggle from './LanguageToggle'

// Slim top utility bar: brand on the left, search + notifications + theme toggle
// on the right. Primary navigation lives in the BottomNav; sign-out is on the
// Profile page.
export default function Navbar() {
  return (
    <header className="top-bar">
      <Link to="/" className="brand">
        <span className="brand-dot" />
        BG Session
      </Link>
      <div className="top-bar-actions">
        <GlobalSearch />
        <NotificationBell />
        <LanguageToggle />
        <ThemeToggle />
      </div>
    </header>
  )
}
