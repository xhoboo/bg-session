import { useEffect, useState } from 'react'
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
  const [saved, setSaved] = useState(false)
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

  // Flip the switch locally; nothing persists until the user hits Save.
  const toggle = (key) => {
    setPrefs((p) => ({ ...p, [key]: !p[key] }))
    setSaved(false)
  }

  const save = async () => {
    setSaving(true)
    setSaved(false)
    setError('')
    const { error: upErr } = await supabase
      .from('notification_prefs')
      .upsert({ user_id: user.id, ...prefs }, { onConflict: 'user_id' })
    setSaving(false)
    if (upErr) {
      setError(upErr.message)
      return
    }
    setSaved(true)
  }

  return (
    <div className="container container-narrow">
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
              disabled={loading}
              onChange={() => toggle(f.key)}
              aria-label={t(f.label)}
            />
          </label>
        ))}
      </div>

      {saved && <div className="alert alert-success" style={{ marginTop: 16 }}>{t('Saved.')}</div>}

      <button
        className="btn btn-primary btn-block"
        onClick={save}
        disabled={loading || saving}
        style={{ marginTop: 16 }}
      >
        {saving ? t('Saving…') : t('Save')}
      </button>
    </div>
  )
}
