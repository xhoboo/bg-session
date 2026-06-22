import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../lib/i18n'
import GoogleButton from '../components/GoogleButton'
import SettingsMenu from '../components/SettingsMenu'

export default function Signup() {
  const { signUpWithEmail } = useAuth()
  const { t } = useLang()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setInfo('')
    if (password.length < 6) {
      setError(t('Password must be at least 6 characters.'))
      return
    }
    setBusy(true)
    const { data, error } = await signUpWithEmail(email, password, name)
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    // If email confirmation is enabled, there's no active session yet.
    if (data.session) {
      navigate('/', { replace: true })
    } else {
      setInfo(t('Check your inbox to confirm your email, then sign in.'))
    }
  }

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
        <h2 style={{ marginTop: 0, fontSize: 18 }}>{t('Create your account')}</h2>

        {error && <div className="alert alert-error">{error}</div>}
        {info && <div className="alert alert-success">{info}</div>}

        <GoogleButton onError={setError} />
        <div className="divider">{t('or')}</div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="field-label" htmlFor="name">{t('Display name')}</label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('e.g. Andi')}
              required
            />
          </div>
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
            <label className="field-label" htmlFor="password">
              {t('Password')} <span className="field-hint">{t('(min 6 characters)')}</span>
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
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? t('Creating account…') : t('Sign up')}
          </button>
        </form>
      </div>

      <p className="center muted" style={{ marginTop: 16 }}>
        {t('Already have an account?')} <Link to="/login">{t('Sign in')}</Link>
      </p>
    </div>
  )
}
