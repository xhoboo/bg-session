import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useBlock } from '../lib/useBlock'
import { useLang } from '../lib/i18n'
import ReportDialog from './ReportDialog'

// Report + block/unblock controls for another player's profile. Hidden when the
// target is the current user.
export default function UserSafetyActions({ targetId, targetName }) {
  const { user } = useAuth()
  const { t } = useLang()
  const { blocked, busy, block, unblock } = useBlock(targetId)
  const [showReport, setShowReport] = useState(false)

  if (!user || targetId === user.id) return null

  const toggle = async () => {
    if (blocked) {
      await unblock()
      return
    }
    if (window.confirm(t('Block {name}? They won’t be able to message you, and your existing chat is hidden from your inbox.', { name: targetName }))) {
      await block()
    }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 14 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowReport(true)}>{t('🚩 Report')}</button>
        <button className="btn btn-danger btn-sm" onClick={toggle} disabled={busy}>
          {blocked ? t('Unblock') : t('🚫 Block')}
        </button>
      </div>
      {blocked && (
        <p className="muted center" style={{ fontSize: 12, marginTop: 8 }}>
          {t('You blocked {name}. They can’t message you.', { name: targetName })}
        </p>
      )}
      {showReport && (
        <ReportDialog targetId={targetId} targetName={targetName} onClose={() => setShowReport(false)} />
      )}
    </>
  )
}
