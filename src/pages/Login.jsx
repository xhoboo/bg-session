import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import GoogleButton from '../components/GoogleButton'
import ThemeToggle from '../components/ThemeToggle'

export default function Login() {
  const { signInWithEmail } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await signInWithEmail(email, password)
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate(from, { replace: true })
  }

  return (
    <div className="container container-narrow">
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}><ThemeToggle /></div>
      <div className="spacer" />
      <div className="center" style={{ marginBottom: 24 }}>
        <h1 style={{ color: 'var(--teal-700)' }}>BG Session</h1>
        <p className="subtitle" style={{ margin: 0 }}>
          Host & join board game meetups around Jakarta.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Welcome back</h2>

        {error && <div className="alert alert-error">{error}</div>}

        <GoogleButton onError={setError} />
        <div className="divider">or</div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="field-label" htmlFor="email">Email</label>
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
            <label className="field-label" htmlFor="password">Password</label>
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
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>

      <p className="center muted" style={{ marginTop: 16 }}>
        New here? <Link to="/signup">Create an account</Link>
      </p>
    </div>
  )
}
