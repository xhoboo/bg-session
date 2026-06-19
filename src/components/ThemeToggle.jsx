import { useState } from 'react'

// Light/dark toggle. The active theme lives as `data-theme` on <html> and is
// persisted to localStorage; an inline script in index.html applies it before
// first paint so there's no flash on reload.
const current = () => document.documentElement.getAttribute('data-theme') || 'light'

export default function ThemeToggle() {
  const [theme, setTheme] = useState(current)

  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem('bg-theme', next) } catch (e) { /* ignore */ }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#211e1a' : '#F4F1EA')
    setTheme(next)
  }

  return (
    <button className="icon-btn" onClick={toggle} aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}>
      {theme === 'light' ? '☾' : '☀'}
    </button>
  )
}
