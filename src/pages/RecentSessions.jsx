import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useLang } from '../lib/i18n'
import SessionCard from '../components/SessionCard'
import { SessionListSkeleton } from '../components/Skeleton'

// Guest "Sessions" tab: a read-only feed of the 20 most recently finished
// meetups, regardless of who hosted or joined them — so visitors who aren't
// signed in can still see what's been happening. Backed by the
// list_recent_finished_sessions SECURITY DEFINER function (public listing fields
// + host display only). Each card links to the guest read-only session page.
//
// The host arrives flattened (host_* columns); fold it back into the nested
// `host` shape SessionCard expects, exactly like the guest Browse feed.
const normalizeRow = (row) => ({
  ...row,
  host: { nickname: row.host_nickname, display_name: row.host_display_name, avatar_url: row.host_avatar_url },
})

export default function RecentSessions() {
  const { t } = useLang()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data, error: qErr } = await supabase.rpc('list_recent_finished_sessions')
      if (!active) return
      if (qErr) setError(qErr.message)
      else setSessions((data ?? []).map(normalizeRow))
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="container">
      <h1>{t('Recent Sessions')}</h1>
      <p className="subtitle">{t('The latest board game meetups that have wrapped up.')}</p>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <SessionListSkeleton />
      ) : sessions.length === 0 ? (
        <div className="empty-state">
          <p>{t('No finished sessions yet.')}</p>
        </div>
      ) : (
        <div className="session-list">
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  )
}
