import { useLang } from '../lib/i18n'

// In-app confirmation dialog — a drop-in replacement for window.confirm so
// prompts wear the app's chrome instead of the browser's. Drive it from a piece
// of state holding the pending action and render it conditionally (or via `open`).
export default function ConfirmModal({
  open = true,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  danger = false,
  busy = false,
}) {
  const { t } = useLang()
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <p style={{ margin: '0 0 16px' }}>{message}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel || t('Cancel')}
          </button>
          <button
            type="button"
            className={'btn ' + (danger ? 'btn-danger' : 'btn-primary')}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel || t('Confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
