import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { LanguageProvider } from './lib/i18n'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LanguageProvider>
      {/* Vercel Web Analytics — privacy-friendly page-view + visitor counts. */}
      <Analytics />
    </BrowserRouter>
  </React.StrictMode>,
)
