import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'
import BottomNav from './BottomNav'
import WelcomeModal from './WelcomeModal'
import CreateSessionModal from './CreateSessionModal'

export default function Layout() {
  return (
    <div className="app-shell">
      <Navbar />
      <main className="app-main">
        <Outlet />
      </main>
      <BottomNav />
      {/* First-visit popup for guests; renders nothing for signed-in users. */}
      <WelcomeModal />
      {/* "Host a session" type chooser, opened on demand via promptCreate(). */}
      <CreateSessionModal />
    </div>
  )
}
