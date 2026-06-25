import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../lib/i18n'

// Reasons a player can pick when reporting someone. The chosen label is stored
// verbatim in user_reports.reason.
const REASONS = [
  'Harassment or abuse',
  'Spam or scam',
  'Inappropriate messages',
  'Fake or impersonating profile',
  'No-show / unreliable',
  'Other',
]

// Modal for filing a report about another player. Reports are insert-only and
// triaged by admins (see migration 0037); the reported user is not notified.
export default function ReportDialog({ targetId, targetName, sessionId = null, onClose }) {
  const { user } = useAuth()
  const { t } = useLang()
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async () => {
    if (!reason) return setError(t('Please choose a reason.'))
    setBusy(true)
    setError('')
    const { error } = await supabase.from('user_reports').insert({
      reporter_id: user.id,
      reported_id: targetId,
      reason,
      details: details.trim(),
      session_id: sessionId,
    })
    setBusy(false)
    if (error) return setError(error.message)
    setDone(true)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Report ${targetName}`}
      >
        {done ? (
          <>
            <h2 style={{ marginTop: 0 }}>{t('Report Sent')}</h2>
            <p className="muted">
              {t('Thanks — our team will review your report about {name}. Reports are kept confidential.', { name: targetName })}
            </p>
            <button className="btn btn-primary btn-block" onClick={onClose}>{t('Done')}</button>
          </>
        ) : (
          <>
            <h2 style={{ marginTop: 0 }}>{t('Report {name}', { name: targetName })}</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              {t("Reports are confidential and {name} won't be notified.", { name: targetName })}
            </p>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="form-group">
              <label className="field-label">{t('Reason')}</label>
              <div className="stack" style={{ gap: 8 }}>
                {REASONS.map((r) => (
                  <label
                    key={r}
                    className={'check-pill' + (reason === r ? ' is-on' : '')}
                    style={{ width: '100%', justifyContent: 'flex-start' }}
                  >
                    <input type="radio" name="report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
                    {t(r)}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="field-label" htmlFor="report-details">
                {t('Details')} <span className="field-hint">{t('(optional)')}</span>
              </label>
              <textarea
                id="report-details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={t('Add anything that helps us understand what happened…')}
                maxLength={2000}
              />
            </div>
            <div className="form-row">
              <button className="btn btn-secondary" onClick={onClose} disabled={busy}>{t('Cancel')}</button>
              <button className="btn btn-danger" onClick={submit} disabled={busy || !reason}>{t('Send Report')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
