import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../lib/i18n'
import { CREATE_PROMPT_EVENT } from '../lib/createPrompt'

// Popup that picks between a one-off meetup and a recurring weekly session.
// Opened on demand (the FAB, "Host a Session" CTAs) via promptCreate() instead
// of navigating to a separate chooser page. Mounted once in Layout.
export default function CreateSessionModal() {
  const { t } = useLang()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onPrompt = () => setOpen(true)
    window.addEventListener(CREATE_PROMPT_EVENT, onPrompt)
    return () => window.removeEventListener(CREATE_PROMPT_EVENT, onPrompt)
  }, [])

  if (!open) return null

  const close = () => setOpen(false)
  const go = (path) => {
    setOpen(false)
    navigate(path)
  }

  return (
    <div className="modal-overlay" onClick={close}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('Host a Session')}
      >
        <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>{t('Host a Session')}</h2>
        <p className="subtitle" style={{ marginTop: 0 }}>{t('Choose how you want to host.')}</p>

        <div className="choice-grid">
          <button type="button" className="card choice-card" onClick={() => go('/create/one-time')}>
            <svg className="choice-emoji" aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2.5" />
              <path d="M16 2v4M8 2v4M3 10h18" />
              <circle cx="12" cy="16" r="2" fill="currentColor" stroke="none" />
            </svg>
            <div>
              <div className="choice-title">{t('One-Time Session')}</div>
              <div className="choice-desc">{t('A single meetup on a specific date and time.')}</div>
            </div>
          </button>

          <button type="button" className="card choice-card" onClick={() => go('/create/weekly')}>
            <svg className="choice-emoji" aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-.18-5" />
            </svg>
            <div>
              <div className="choice-title">{t('Weekly Session')}</div>
              <div className="choice-desc">
                {t('Repeats every week on the day you pick. Everything resets except your co-hosts.')}
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
