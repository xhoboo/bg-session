import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../lib/i18n'
import { isScoringOpen } from '../lib/format'
import { promptAuth } from '../lib/authPrompt'

// Primary mobile navigation: four tabs with a center FAB. The FAB hosts a new
// session normally, but turns into a "score a game" shortcut while the user has
// a session in progress (scoring window open). The Messages tab carries a live
// unread direct-message badge.
function Icon({ name }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (name === 'browse') return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></svg>
  if (name === 'sessions') return <svg {...common}><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
  if (name === 'messages') return <svg {...common}><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.9-.9L3 21l1.9-5.6A8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" /></svg>
  return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
}

export default function BottomNav() {
  const { user } = useAuth()
  const { t } = useLang()
  const navigate = useNavigate()
  const [unread, setUnread] = useState(0)
  const [activeSession, setActiveSession] = useState(null)

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

  // Is one of the user's sessions (hosted or joined) in its scoring window right
  // now? If so the FAB becomes a shortcut to record scores for it. Re-checked on
  // a minute timer so it flips on as a session starts and off after it closes.
  useEffect(() => {
    if (!user) return
    let active = true
    const check = async () => {
      const [{ data: hosted }, { data: approved }] = await Promise.all([
        supabase.from('sessions').select('id, starts_at, duration_minutes').eq('host_id', user.id),
        supabase
          .from('join_requests')
          .select('session:sessions(id, starts_at, duration_minutes)')
          .eq('guest_id', user.id)
          .eq('status', 'approved'),
      ])
      const all = [...(hosted ?? []), ...(approved ?? []).map((r) => r.session).filter(Boolean)]
      const open = all.filter(isScoringOpen).sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at))
      if (active) setActiveSession(open[0] || null)
    }
    check()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') check() }, 60_000)
    return () => { active = false; clearInterval(timer) }
  }, [user])

  const cls = ({ isActive }) => 'bottom-nav-item' + (isActive ? ' active' : '')

  // Browse is public; the other tabs need an account, so for guests we open the
  // sign-in popup right here instead of navigating (same as the FAB).
  const guestGuard = (e) => {
    if (!user) {
      e.preventDefault()
      promptAuth()
    }
  }

  return (
    <nav className="bottom-nav" aria-label="Primary">
      <NavLink to="/" end className={cls}><Icon name="browse" /><span>{t('Browse')}</span></NavLink>
      <NavLink to="/my-sessions" className={cls} onClick={guestGuard}><Icon name="sessions" /><span>{t('Sessions')}</span></NavLink>
      <div className="bottom-nav-spacer" aria-hidden="true" />
      <NavLink to="/messages" className={cls} onClick={guestGuard}>
        <Icon name="messages" /><span>{t('Messages')}</span>
        {unread > 0 && <span className="bottom-nav-badge">{unread > 9 ? '9+' : unread}</span>}
      </NavLink>
      <NavLink to="/profile" className={cls} onClick={guestGuard}><Icon name="profile" /><span>{t('Profile')}</span></NavLink>

      {activeSession ? (
        <button className="fab fab-score" onClick={() => navigate(`/sessions/${activeSession.id}/score`)} aria-label={t('Score a Game')}>
          {/* Trophy — "record a result for your live session" */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h12v3a6 6 0 0 1-12 0V4z" /><path d="M6 6H3v1a3 3 0 0 0 3 3M18 6h3v1a3 3 0 0 1-3 3M9 17h6M10 17v3M14 17v3M8 20h8" /></svg>
        </button>
      ) : (
        <button className="fab" onClick={() => (user ? navigate('/create') : promptAuth())} aria-label={t('Host a Session')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      )}
    </nav>
  )
}
