import { useNavigate } from 'react-router-dom'
import { formatDateTime, playerCount, isSessionFull, isSessionFinished } from '../lib/format'
import Avatar from './Avatar'

export default function SessionCard({ session }) {
  const navigate = useNavigate()
  const hostName = session.host?.display_name || 'Host'
  const spots = playerCount(session)
  const isFull = isSessionFull(session)
  const finished = isSessionFinished(session)

  return (
    <div className="card session-card" onClick={() => navigate(`/sessions/${session.id}`)}>
      <div className="row-between">
        <span className="session-card-title">{session.title}</span>
        <span style={{ display: 'inline-flex', gap: 6, flex: 'none' }}>
          <span className={'badge ' + (session.recurrence === 'weekly' ? 'badge-weekly' : 'badge-onetime')}>
            {session.recurrence === 'weekly' ? 'Weekly' : 'One-time'}
          </span>
          {finished ? (
            <span className="badge badge-done">Done</span>
          ) : (
            <span className={'badge ' + (session.session_type === 'open' ? 'badge-open' : 'badge-approval')}>
              {session.session_type === 'open' ? 'Open' : 'Approval'}
            </span>
          )}
        </span>
      </div>

      <div className="session-meta">
        <span>📅 {formatDateTime(session.starts_at)}</span>
      </div>
      <div className="session-meta">
        <span><span className="badge badge-area">{session.region ? `${session.region} · ${session.area}` : session.area}</span></span>
        <span>👥 {spots} players{isFull ? ' · full' : ''}</span>
        <span>🎲 {session.board_games ? truncate(session.board_games, 40) : 'TBD'}</span>
      </div>

      <div className="muted" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
        <Avatar name={hostName} src={session.host?.avatar_url} size={22} />
        Hosted by {hostName}
      </div>
    </div>
  )
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
