import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../lib/i18n'
import { isSessionFinished } from '../lib/format'
import { promptCreate } from '../lib/createPrompt'
import { SessionListSkeleton } from '../components/Skeleton'
import SessionCard from '../components/SessionCard'

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
        .select('*, host:profiles(display_name, avatar_url)')
        .eq('host_id', user.id)
        .gte('starts_at', cutoff)
        .order('starts_at', { ascending: true }),
      supabase
        .from('join_requests')
        .select('id, status, session:sessions(id, title, starts_at, duration_minutes, region, area, max_players, confirmed_count, session_type, recurrence, occurrence_number, host:profiles(display_name, avatar_url))')
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
        <h1>{t('My Sessions')}</h1>
        <SessionListSkeleton count={3} />
      </div>
    )
  }

  return (
    <div className="container">
      <h1>{t('My Sessions')}</h1>

      <h2 className="section-title">{t('Hosting ({n})', { n: hosting.length })}</h2>
      {hosting.length === 0 ? (
        <div className="empty-state" style={{ padding: 24 }}>
          <button type="button" className="btn btn-primary" onClick={promptCreate}>{t('Host a Session')}</button>
        </div>
      ) : (
        <div className="session-list">
          {hosting.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}

      <h2 className="section-title">{t('Joined / Requested ({n})', { n: joined.length })}</h2>
      {joined.length === 0 ? (
        <div className="empty-state" style={{ padding: 24 }}>
          <p>{t("You haven't requested to join any sessions yet.")}</p>
          <Link to="/" className="btn btn-secondary">{t('Browse Sessions')}</Link>
        </div>
      ) : (
        <div className="session-list">
          {joined.map((r) => (
            <SessionCard
              key={r.id}
              session={r.session}
              statusBadge={
                <span className={'badge badge-' + r.status}>
                  {r.status === 'approved' ? t('Approved') : r.status === 'rejected' ? t('Declined') : r.status === 'waitlisted' ? t('Waitlist') : t('Pending')}
                </span>
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
