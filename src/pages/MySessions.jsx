import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../lib/i18n'
import { formatDateTime, playerCount, isSessionFinished } from '../lib/format'
import { SessionListSkeleton } from '../components/Skeleton'
import OccurrenceBadge from '../components/OccurrenceBadge'

export default function MySessions() {
  const { user } = useAuth()
  const { t } = useLang()
  const [hosting, setHosting] = useState([])
  const [joined, setJoined] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    // Active = not yet finished (upcoming + in progress). Finished sessions move
    // to the Profile archive. We fetch from a little before "now" so in-progress
    // sessions (started but not finished) are still included, then filter exactly.
    const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
    Promise.all([
      supabase
        .from('sessions')
        .select('*')
        .eq('host_id', user.id)
        .gte('starts_at', cutoff)
        .order('starts_at', { ascending: true }),
      supabase
        .from('join_requests')
        .select('id, status, session:sessions(id, title, starts_at, duration_minutes, area, max_players, confirmed_count, session_type, recurrence, occurrence_number)')
        .eq('guest_id', user.id)
        .order('created_at', { ascending: false }),
    ]).then(([hostRes, joinRes]) => {
      if (!active) return
      setHosting((hostRes.data ?? []).filter((s) => !isSessionFinished(s)))
      setJoined((joinRes.data ?? []).filter((r) => r.session && !isSessionFinished(r.session)))
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [user.id])

  if (loading) {
    return (
      <div className="container">
        <h1>{t('My sessions')}</h1>
        <SessionListSkeleton count={3} />
      </div>
    )
  }

  return (
    <div className="container">
      <h1>{t('My sessions')}</h1>

      <h2 className="section-title">{t('Hosting ({n})', { n: hosting.length })}</h2>
      {hosting.length === 0 ? (
        <div className="empty-state" style={{ padding: 24 }}>
          <p>{t("You're not hosting anything yet.")}</p>
          <Link to="/create" className="btn btn-primary">{t('Host a session')}</Link>
        </div>
      ) : (
        <div className="session-list">
          {hosting.map((s) => (
            <Link to={`/sessions/${s.id}`} key={s.id} className="card session-card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="row-between">
                <span className="session-card-title">{s.title}</span>
                <span style={{ display: 'inline-flex', gap: 6, flex: 'none' }}>
                  <span className={'badge ' + (s.recurrence === 'weekly' ? 'badge-weekly' : 'badge-onetime')}>
                    {s.recurrence === 'weekly' ? t('Weekly') : t('One-time')}
                  </span>
                  <OccurrenceBadge session={s} />
                  <span className={'badge ' + (s.session_type === 'open' ? 'badge-open' : 'badge-approval')}>
                    {s.session_type === 'open' ? t('Open') : t('Approval')}
                  </span>
                </span>
              </div>
              <div className="session-meta">
                <span>📅 {formatDateTime(s.starts_at)}</span>
                {s.area && <span><span className="badge badge-area">{s.area}</span></span>}
                <span>👥 {playerCount(s)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <h2 className="section-title">{t('Joined / requested ({n})', { n: joined.length })}</h2>
      {joined.length === 0 ? (
        <div className="empty-state" style={{ padding: 24 }}>
          <p>{t("You haven't requested to join any sessions yet.")}</p>
          <Link to="/" className="btn btn-secondary">{t('Browse sessions')}</Link>
        </div>
      ) : (
        <div className="session-list">
          {joined.map((r) => (
            <Link to={`/sessions/${r.session.id}`} key={r.id} className="card session-card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="row-between">
                <span className="session-card-title">{r.session.title}</span>
                <span style={{ display: 'inline-flex', gap: 6, flex: 'none' }}>
                  <span className={'badge ' + (r.session.recurrence === 'weekly' ? 'badge-weekly' : 'badge-onetime')}>
                    {r.session.recurrence === 'weekly' ? t('Weekly') : t('One-time')}
                  </span>
                  <OccurrenceBadge session={r.session} />
                  <span className={'badge badge-' + r.status}>
                    {r.status === 'approved' ? t('Approved') : r.status === 'rejected' ? t('Declined') : r.status === 'waitlisted' ? t('Waitlist') : t('Pending')}
                  </span>
                </span>
              </div>
              <div className="session-meta">
                <span>📅 {formatDateTime(r.session.starts_at)}</span>
                {r.session.area && <span><span className="badge badge-area">{r.session.area}</span></span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
