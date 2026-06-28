import { useAuth } from '../context/AuthContext'
import { useLang } from '../lib/i18n'
import { formatDate } from '../lib/format'

// Shown at the top of every page while the signed-in user is under an active
// suspension (set by an admin via the Reports tool — profiles.banned_until /
// ban_reason). The database also blocks hosting and joining (migration 0061);
// this just tells the user why their actions are being refused, and until when.
export default function BanBanner() {
  const { profile } = useAuth()
  const { t } = useLang()

  const until = profile?.banned_until ? new Date(profile.banned_until) : null
  if (!until || until <= new Date()) return null

  return (
    <div className="container" style={{ paddingTop: 12 }}>
      <div className="alert alert-error" role="alert" style={{ marginBottom: 0 }}>
        <strong>{t('Your account is suspended')}</strong>
        <div style={{ marginTop: 4 }}>
          {t("Your account is suspended until {date}. Until then you can't host or join sessions.", {
            date: formatDate(profile.banned_until),
          })}
        </div>
        {profile.ban_reason && (
          <div style={{ marginTop: 4 }}>
            {t('Reason: {reason}', { reason: t(profile.ban_reason) })}
          </div>
        )}
      </div>
    </div>
  )
}
