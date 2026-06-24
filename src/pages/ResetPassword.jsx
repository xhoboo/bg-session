import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../lib/i18n'
import SettingsMenu from '../components/SettingsMenu'

// Landing page for the password-reset email link. Supabase detects the recovery
// token in the URL and establishes a temporary session, which lets the user set
// a new password here via updateUser. Reached only from the emailed link.
export default function ResetPassword() {
  const { user, loading, updatePassword } = useAuth()
  const { t } = useLang()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  // The recovery session arrives via onAuthStateChange a beat after load, so we
  // wait briefly before deciding a link is invalid (no session ever showed up).
  const [graceOver, setGraceOver] = useState(false)

  useEffect(() => {
    if (loading || user) return
    const id = setTimeout(() => setGraceOver(true), 2500)
    return () => clearTimeout(id)
  }, [loading, user])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError(t('Password must be at least 6 characters.'))
      return
    }
    if (password !== confirm) {
      setError(t('Passwords don’t match.'))
      return
    }
    setBusy(true)
    const { error } = await updatePassword(password)
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setDone(true)
  }

  const shell = (children) => (
    <div className="container container-narrow">
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}><SettingsMenu /></div>
      <div className="spacer" />
      <div className="center" style={{ marginBottom: 24 }}>
        <h1 style={{ color: 'var(--teal-700)' }}>BG Session</h1>
        <p className="subtitle" style={{ margin: 0 }}>
          {t('Host & join board game meetups in your area.')}
        </p>
      </div>
      {children}
    </div>
  )

  // Still waiting for the recovery session to settle.
  if ((loading || !user) && !graceOver) {
    return <div className="spinner" aria-label="Loading" />
  }

  // No session ever arrived — the link was bad, already used, or expired.
  if (!user) {
    return shell(
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>{t('Reset your password')}</h2>
        <div className="alert alert-error" style={{ marginBottom: 12 }}>
          {t('This reset link is invalid or has expired.')}
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          {t('Request a new link from the sign-in page.')}
        </p>
        <Link to="/login" className="btn btn-secondary btn-block">{t('← Back to sign in')}</Link>
      </div>,
    )
  }

  return shell(
    <div className="card">
      <h2 style={{ marginTop: 0, fontSize: 18 }}>{t('Reset your password')}</h2>

      {done ? (
        <>
          <div className="alert alert-success">
            {t('Your password has been updated. You’re all set.')}
          </div>
          <button className="btn btn-primary btn-block" onClick={() => navigate('/', { replace: true })}>
            {t('Continue')}
          </button>
        </>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0 }}>{t('Choose a new password for your account.')}</p>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="field-label" htmlFor="password">
                {t('New password')} <span className="field-hint">{t('(min 6 characters)')}</span>
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="field-label" htmlFor="confirm">{t('Confirm password')}</label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {busy ? t('Updating…') : t('Update password')}
            </button>
          </form>
        </>
      )}
    </div>,
  )
}
