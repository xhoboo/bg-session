import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../lib/i18n'
import GoogleButton from '../components/GoogleButton'
import SettingsMenu from '../components/SettingsMenu'

export default function Login() {
  const { signInWithEmail, resetPasswordForEmail } = useAuth()
  const { t } = useLang()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Offer a password reset only once the user has fumbled the password twice —
  // keeps the happy path uncluttered for people who simply mistyped once.
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await signInWithEmail(email, password)
    setBusy(false)
    if (error) {
      setError(error.message)
      setFailedAttempts((n) => n + 1)
      return
    }
    navigate(from, { replace: true })
  }

  const handleReset = async () => {
    if (!email) {
      setError(t('Enter your email above, then request a reset link.'))
      return
    }
    setError('')
    setResetBusy(true)
    const { error } = await resetPasswordForEmail(email)
    setResetBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setResetSent(true)
  }

  const showForgot = failedAttempts >= 2

  return (
    <div className="container container-narrow">
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}><SettingsMenu /></div>
      <div className="spacer" />
      <div className="center" style={{ marginBottom: 24 }}>
        <h1 style={{ color: 'var(--teal-700)' }}>BG Session</h1>
        <p className="subtitle" style={{ margin: 0 }}>
          {t('Host & join board game meetups in your area.')}
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>{t('Welcome back')}</h2>

        {error && <div className="alert alert-error">{error}</div>}

        <GoogleButton onError={setError} />
        <div className="divider">{t('or')}</div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="field-label" htmlFor="email">{t('Email')}</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="field-label" htmlFor="password">{t('Password')}</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? t('Signing in…') : t('Sign in')}
          </button>
        </form>

        {showForgot && (
          <div className="forgot-box">
            {resetSent ? (
              <div className="alert alert-success" style={{ margin: 0 }}>
                {t('If an account exists for {email}, a reset link is on its way. Check your inbox.', { email })}
              </div>
            ) : (
              <>
                <p className="muted" style={{ margin: '0 0 10px', fontSize: 13 }}>
                  {t('Forgot your password? We can email you a link to set a new one.')}
                </p>
                <button
                  type="button"
                  className="btn btn-secondary btn-block btn-sm"
                  onClick={handleReset}
                  disabled={resetBusy}
                >
                  {resetBusy ? t('Sending…') : t('Email me a reset link')}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <p className="center muted" style={{ marginTop: 16 }}>
        {t('New here?')} <Link to="/signup">{t('Create an account')}</Link>
      </p>
    </div>
  )
}
