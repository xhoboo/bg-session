import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

// Primary mobile navigation: four tabs with a center "host a session" FAB.
// The Messages tab carries a live unread direct-message badge.
function Icon({ name }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (name === 'browse') return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></svg>
  if (name === 'sessions') return <svg {...common}><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
  if (name === 'messages') return <svg {...common}><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.9-.9L3 21l1.9-5.6A8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" /></svg>
  return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
}

export default function BottomNav() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!user) return
    let active = true
    const refresh = async () => {
      const { count } = await supabase
        .from('direct_messages')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('read', false)
      if (active) setUnread(count ?? 0)
    }
    refresh()
    const channel = supabase
      .channel('dm-unread-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages', filter: `recipient_id=eq.${user.id}` }, () => refresh())
      .subscribe()
    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [user])

  const cls = ({ isActive }) => 'bottom-nav-item' + (isActive ? ' active' : '')

  return (
    <nav className="bottom-nav" aria-label="Primary">
      <NavLink to="/" end className={cls}><Icon name="browse" /><span>Browse</span></NavLink>
      <NavLink to="/my-sessions" className={cls}><Icon name="sessions" /><span>Sessions</span></NavLink>
      <div className="bottom-nav-spacer" aria-hidden="true" />
      <NavLink to="/messages" className={cls}>
        <Icon name="messages" /><span>Messages</span>
        {unread > 0 && <span className="bottom-nav-badge">{unread > 9 ? '9+' : unread}</span>}
      </NavLink>
      <NavLink to="/profile" className={cls}><Icon name="profile" /><span>Profile</span></NavLink>

      <button className="fab" onClick={() => navigate('/create')} aria-label="Host a session">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </nav>
  )
}
