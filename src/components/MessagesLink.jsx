import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

// Navbar "Messages" link with a live unread direct-message count.
export default function MessagesLink() {
  const { user } = useAuth()
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'direct_messages', filter: `recipient_id=eq.${user.id}` },
        () => refresh(),
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [user])

  return (
    <NavLink to="/messages" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')} style={{ position: 'relative' }}>
      Messages
      {unread > 0 && <span className="bell-badge" style={{ top: -6, right: -12 }}>{unread > 9 ? '9+' : unread}</span>}
    </NavLink>
  )
}
