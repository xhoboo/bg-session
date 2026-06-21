import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { timeAgo } from '../lib/format'

export default function NotificationBell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)

  const unread = items.filter((n) => !n.read).length

  const load = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)
    setItems(data ?? [])
  }, [user])

  // Initial load + live updates via Supabase Realtime.
  useEffect(() => {
    if (!user) return
    load()

    const channel = supabase
      .channel('notifications-' + user.id)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => setItems((prev) => (prev.some((n) => n.id === payload.new.id) ? prev : [payload.new, ...prev])),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, load])

  // Close the panel on outside click.
  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const markAllRead = async () => {
    const unreadIds = items.filter((n) => !n.read).map((n) => n.id)
    if (unreadIds.length === 0) return
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    await supabase.from('notifications').update({ read: true }).in('id', unreadIds)
  }

  const onItemClick = async (note) => {
    if (!note.read) {
      setItems((prev) => prev.map((n) => (n.id === note.id ? { ...n, read: true } : n)))
      await supabase.from('notifications').update({ read: true }).eq('id', note.id)
    }
    setOpen(false)
    if (note.session_id) navigate(`/sessions/${note.session_id}`)
  }

  return (
    <div ref={panelRef} style={{ display: 'inline-flex' }}>
      <button
        className="bell"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && <span className="bell-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-header">
            <span>Notifications</span>
            {unread > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          <div className="notif-list">
            {items.length === 0 ? (
              <div className="empty-state" style={{ padding: 28 }}>
                No notifications yet.
              </div>
            ) : (
              items.map((note) => (
                <div
                  key={note.id}
                  className={'notif-item' + (note.read ? '' : ' unread')}
                  onClick={() => onItemClick(note)}
                >
                  <div className="notif-item-title">{note.title}</div>
                  {note.body && <div className="notif-item-body">{note.body}</div>}
                  <div className="notif-item-time">{timeAgo(note.created_at)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
