import { Link } from 'react-router-dom'
import { useLang } from '../lib/i18n'

// Shown when the user taps "+" / "Host a session". Picks between a one-off
// meetup and a recurring weekly session.
export default function CreateSessionChooser() {
  const { t } = useLang()
  return (
    <div className="container container-narrow">
      <h1>{t('Host a session')}</h1>
      <p className="subtitle">{t('Choose how you want to host.')}</p>

      <div className="choice-grid">
        <Link to="/create/one-time" className="card choice-card">
          <span className="choice-emoji" aria-hidden="true">🎲</span>
          <div>
            <div className="choice-title">{t('One-time session')}</div>
            <div className="choice-desc">{t('A single meetup on a specific date and time.')}</div>
          </div>
        </Link>

        <Link to="/create/weekly" className="card choice-card">
          <span className="choice-emoji" aria-hidden="true">🔁</span>
          <div>
            <div className="choice-title">{t('Weekly session')}</div>
            <div className="choice-desc">
              {t('Repeats every week on the day you pick. You keep your co-hosts; players and board games reset each week and roll forward to the next date automatically.')}
            </div>
          </div>
        </Link>
      </div>
    </div>
  )
}
