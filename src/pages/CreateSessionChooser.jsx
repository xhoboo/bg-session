import { Link } from 'react-router-dom'
import { useLang } from '../lib/i18n'

// Shown when the user taps "+" / "Host a session". Picks between a one-off
// meetup and a recurring weekly session.
export default function CreateSessionChooser() {
  const { t } = useLang()
  return (
    <div className="container container-narrow">
      <h1>{t('Host a Session')}</h1>

      <div className="choice-grid">
        <Link to="/create/one-time" className="card choice-card">
          <svg className="choice-emoji" aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2.5" />
            <path d="M16 2v4M8 2v4M3 10h18" />
            <circle cx="12" cy="16" r="2" fill="currentColor" stroke="none" />
          </svg>
          <div>
            <div className="choice-title">{t('One-Time Session')}</div>
            <div className="choice-desc">{t('A single meetup on a specific date and time.')}</div>
          </div>
        </Link>

        <Link to="/create/weekly" className="card choice-card">
          <svg className="choice-emoji" aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-.18-5" />
          </svg>
          <div>
            <div className="choice-title">{t('Weekly Session')}</div>
            <div className="choice-desc">
              {t('Repeats every week on the day you pick. Everything resets except your co-hosts.')}
            </div>
          </div>
        </Link>
      </div>
    </div>
  )
}
