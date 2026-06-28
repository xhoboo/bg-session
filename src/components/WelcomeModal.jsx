import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../lib/i18n'
import { AUTH_PROMPT_EVENT } from '../lib/authPrompt'

const DISMISS_KEY = 'bg_welcome_dismissed'

const wasDismissed = () => {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

// First-visit popup for guests (not signed in). Offers Sign Up / Sign In, or
// "Continue as Guest" to browse the public content without an account. Once the
// visitor picks guest (or signs in), it stays dismissed via localStorage. Never
// shown to signed-in users.
export default function WelcomeModal() {
  const { user } = useAuth()
  const { t } = useLang()
  const navigate = useNavigate()
  const [open, setOpen] = useState(() => !wasDismissed())

  // Let guest CTAs (the FAB, "Host a Session" buttons) re-open this same popup
  // on demand, even after the first-visit dismissal.
  useEffect(() => {
    const onPrompt = () => setOpen(true)
    window.addEventListener(AUTH_PROMPT_EVENT, onPrompt)
    return () => window.removeEventListener(AUTH_PROMPT_EVENT, onPrompt)
  }, [])

  if (user || !open) return null

  const continueAsGuest = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore — modal just reappears next load */
    }
    setOpen(false)
  }

  return (
    <div className="modal-overlay" onClick={continueAsGuest}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('Welcome to BG Session')}
      >
        <div className="center" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, marginBottom: 6, color: 'var(--teal-700)' }}>{t('Welcome to BG Session')}</h2>
          <p className="muted" style={{ margin: 0 }}>
            {t('Sign up to host and join board game meetups — or keep looking around as a guest.')}
          </p>
        </div>
        <button className="btn btn-primary btn-block" onClick={() => navigate('/signup')}>{t('Sign Up')}</button>
        <div className="spacer" />
        <button className="btn btn-secondary btn-block" onClick={() => navigate('/login')}>{t('Sign In')}</button>
        <button
          type="button"
          onClick={continueAsGuest}
          style={{ display: 'block', margin: '16px auto 0', background: 'none', border: 'none', color: 'var(--slate-600)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
        >
          {t('Continue as Guest')}
        </button>
      </div>
    </div>
  )
}
