import { useLang } from '../lib/i18n'

// A session's recurrence tag. A weekly series folds its occurrence_number (set
// server-side at roll time) straight into the tag — e.g. "Weekly #5" — shown
// with a soft accent glow so the running count stands out. Plain "Weekly"
// before the first roll, and "One-time" for non-recurring sessions.
export default function RecurrenceBadge({ session }) {
  const { t } = useLang()
  if (session?.recurrence !== 'weekly') {
    return <span className="badge badge-onetime">{t('One-time')}</span>
  }
  const n = session?.occurrence_number
  return (
    <span
      className={'badge badge-weekly' + (n ? ' badge-weekly-count' : '')}
      title={n ? t('Week {n}', { n }) : undefined}
    >
      {t('Weekly')}{n ? ` #${n}` : ''}
    </span>
  )
}
