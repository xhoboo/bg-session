import { Link } from 'react-router-dom'
import GlobalSearch from './GlobalSearch'
import NotificationBell from './NotificationBell'
import SettingsMenu from './SettingsMenu'

// Slim top utility bar: brand on the left, search + notifications + a settings
// menu (language + theme) on the right. Primary navigation lives in the
// BottomNav; sign-out is on the Profile page.
export default function Navbar() {
  return (
    <header className="top-bar">
      {/* Full-bleed bar; the inner wrapper keeps the brand + actions aligned to
          the same centered column as the page content. */}
      <div className="top-bar-inner">
        <Link to="/" className="brand">
          <span className="brand-dot" />
          BG Session
        </Link>
        <div className="top-bar-actions">
          <GlobalSearch />
          <NotificationBell />
          <SettingsMenu />
        </div>
      </div>
    </header>
  )
}
