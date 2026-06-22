import { useEffect, useRef, useState } from 'react'
import { useLang } from '../lib/i18n'

// One top-bar button that opens a small dropdown holding both preferences:
// language (EN/ID) and theme (light/dark). Replaces the two separate toggles
// that used to sit side by side. The panel anchors to the right edge of
// `.top-bar-actions` like the search and notification dropdowns.
const currentTheme = () => document.documentElement.getAttribute('data-theme') || 'light'

export default function SettingsMenu() {
  const { lang, setLang, t } = useLang()
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState(currentTheme)
  const wrapRef = useRef(null)

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const applyTheme = (next) => {
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem('bg-theme', next) } catch (e) { /* ignore */ }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#211e1a' : '#F4F1EA')
    setTheme(next)
  }

  return (
    <div className="settings-wrap" ref={wrapRef}>
      <button
        className="icon-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('Settings')}
        aria-expanded={open}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {open && (
        <div className="settings-panel" role="menu">
          <div className="settings-group">
            <div className="settings-group-label">{t('Language')}</div>
            <div className="settings-options">
              <button className={'settings-opt' + (lang === 'en' ? ' is-on' : '')} onClick={() => setLang('en')}>EN</button>
              <button className={'settings-opt' + (lang === 'id' ? ' is-on' : '')} onClick={() => setLang('id')}>ID</button>
            </div>
          </div>
          <div className="settings-group">
            <div className="settings-group-label">{t('Theme')}</div>
            <div className="settings-options">
              <button className={'settings-opt' + (theme === 'light' ? ' is-on' : '')} onClick={() => applyTheme('light')}>☀ {t('Light')}</button>
              <button className={'settings-opt' + (theme === 'dark' ? ' is-on' : '')} onClick={() => applyTheme('dark')}>☾ {t('Dark')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
