import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../lib/i18n'

// The three email switches map onto the whitelisted email types (migration
// 0049). In-app notifications are unaffected — this only controls email.
const FIELDS = [
  {
    key: 'email_join_updates',
    label: 'Join Updates',
    hint: 'When a host approves, confirms, or declines your request to join.',
  },
  {
    key: 'email_session_reminders',
    label: 'Session Reminders',
    hint: 'A reminder before a session you’re in, and the after-session follow-up.',
  },
  {
    key: 'email_session_changes',
    label: 'Session Changes',
    hint: 'When a session you joined is cancelled by the host.',
  },
]

// Opt-in model: email is off by default. A user has to turn each one on.
const DEFAULTS = { email_join_updates: false, email_session_reminders: false, email_session_changes: false }

export default function NotificationSettings() {
  const { user } = useAuth()
  const { t } = useLang()
  const [prefs, setPrefs] = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    supabase
      .from('notification_prefs')
      .select('email_join_updates, email_session_reminders, email_session_changes')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return
        if (data) setPrefs(data)
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [user.id])

  // Auto-save on toggle (opt-in model). Revert the switch if the upsert fails.
  const toggle = async (key) => {
    const prev = prefs
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    setSaving(true)
    setError('')
    const { error: upErr } = await supabase
      .from('notification_prefs')
      .upsert({ user_id: user.id, ...next }, { onConflict: 'user_id' })
    setSaving(false)
    if (upErr) {
      setPrefs(prev)
      setError(upErr.message)
    }
  }

  return (
    <div className="container container-narrow">
      <Link to="/profile" className="muted" style={{ fontSize: 14 }}>{t('← Back to Profile')}</Link>
      <h1 style={{ marginTop: 12 }}>{t('Email Notifications')}</h1>
      <p className="subtitle">{t('Choose which emails we send you. You’ll always see everything in the in-app bell.')}</p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card stack" aria-busy={loading}>
        {FIELDS.map((f) => (
          <label className="pref-row" key={f.key}>
            <span className="pref-text">
              <span className="pref-label">{t(f.label)}</span>
              <span className="pref-hint">{t(f.hint)}</span>
            </span>
            <input
              type="checkbox"
              className="switch"
              checked={!!prefs[f.key]}
              disabled={loading || saving}
              onChange={() => toggle(f.key)}
              aria-label={t(f.label)}
            />
          </label>
        ))}
      </div>
    </div>
  )
}
