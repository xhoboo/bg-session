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
      <BrowserRouter>
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
