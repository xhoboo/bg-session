import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { AuthProvider } from './context/AuthContext'
import { LanguageProvider } from './lib/i18n'
import { initSentry } from './lib/sentry'
import './index.css'

// Start error monitoring (no-op unless VITE_SENTRY_DSN is set) before render so
// it's ready to catch the earliest errors.
initSentry()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      {/* Future flags: opt in to v7 behavior now — startTransition keeps
          navigation responsive during heavy renders, and both silence the
          upgrade warnings React Router logs in dev. */}
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LanguageProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </LanguageProvider>
        {/* Vercel Web Analytics — privacy-friendly page-view + visitor counts. */}
        <Analytics />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
