import { useLang } from '../lib/i18n'

// A small "medal" badge marking how many times a weekly series has actually run
// — its occurrence_number, set server-side at roll time. It reads as a little
// award on a weekly session's card or header (e.g. 🏅 #5). Renders nothing for
// one-time sessions or rows fetched without the number.
export default function OccurrenceBadge({ session }) {
  const { t } = useLang()
  if (session?.recurrence !== 'weekly' || !session?.occurrence_number) return null
  return (
    <span className="badge badge-occurrence" title={t('Week {n}', { n: session.occurrence_number })}>
      🏅 #{session.occurrence_number}
    </span>
  )
}
