import { useNavigate } from 'react-router-dom'
import { formatDateTime, playerCount, isSessionFull, isSessionFinished, locationLabel } from '../lib/format'
import { useLang } from '../lib/i18n'
import Avatar from './Avatar'
import OccurrenceBadge from './OccurrenceBadge'

export default function SessionCard({ session }) {
  const navigate = useNavigate()
  const { t } = useLang()
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
            {session.recurrence === 'weekly' ? t('Weekly') : t('One-time')}
          </span>
          <OccurrenceBadge session={session} />
          {finished ? (
            <span className="badge badge-done">{t('Done')}</span>
          ) : (
            <span className={'badge ' + (session.session_type === 'open' ? 'badge-open' : 'badge-approval')}>
              {session.session_type === 'open' ? t('Open') : t('Approval')}
            </span>
          )}
        </span>
      </div>

      <div className="session-meta">
        <span>📅 {formatDateTime(session.starts_at)}</span>
      </div>
      <div className="session-meta">
        <span><span className="badge badge-area">{locationLabel(session.region, session.area)}</span></span>
        <span>👥 {t('{n} players', { n: spots })}{isFull ? ` · ${t('full')}` : ''}</span>
      </div>

      <div className="muted" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
        <Avatar name={hostName} src={session.host?.avatar_url} size={22} />
        {t('Hosted by {name}', { name: hostName })}
      </div>
    </div>
  )
}
