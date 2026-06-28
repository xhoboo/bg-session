import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../lib/i18n'

// Lets a confirmed participant pledge board games they'll bring. Pledges surface
// (with the bringer's avatar) in the session's "Board games" list above, so the
// whole table is visible at a glance without doubling up. Games the host already
// listed can't be pledged here — no point bringing what's already on the bill.
// The list itself lives in SessionDetail (`brought`/`setBrought`); this is just
// the add control. `sessionGames` is the host's listed games.
export default function SessionBringList({ sessionId, brought, setBrought, sessionGames = [] }) {
  const { user, profile } = useAuth()
  const { t } = useLang()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const mineLower = new Set(brought.filter((r) => r.user_id === user.id).map((r) => r.game_name.toLowerCase()))
  const listedLower = new Set(sessionGames.map((g) => g.toLowerCase()))
  // Games from my collection I haven't pledged and the host hasn't already listed.
  const quickAdd = (profile?.owned_games ?? []).filter(
    (g) => !mineLower.has(g.toLowerCase()) && !listedLower.has(g.toLowerCase()),
  )

  const add = async (name) => {
    const n = name.trim()
    if (!n) return
    const low = n.toLowerCase()
    if (mineLower.has(low)) return
    if (listedLower.has(low)) return setError(t('That game is already on the session list.'))
    if (sessionGames.length + brought.length >= 50)
      return setError(t('This session already has the maximum of 50 board games.'))
    setBusy(true)
    setError('')
    const { data, error } = await supabase
      .from('session_brought_games')
      .insert({ session_id: sessionId, user_id: user.id, game_name: n })
      .select('id, game_name, user_id, bringer:profiles(nickname, display_name, avatar_url)')
      .single()
    setBusy(false)
    if (error) return setError(error.message)
    setText('')
    if (data) setBrought((prev) => [...prev, data])
  }

  return (
    <>
      <h2 className="section-title">{t('Bring a Board Game')}</h2>
      {quickAdd.length > 0 && (
        <>
          <div className="field-hint" style={{ marginBottom: 6 }}>{t('Quick add from your collection')}</div>
          <div className="chips" style={{ marginBottom: 10 }}>
            {quickAdd.map((g) => (
              <button type="button" className="chip-add" key={g} onClick={() => add(g)} disabled={busy}>+ {g}</button>
            ))}
          </div>
        </>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={text}
          placeholder={t("Add a game you'll bring…")}
          maxLength={80}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(text) } }}
        />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => add(text)} disabled={busy || !text.trim()}>{t('+ Add')}</button>
      </div>
      {error && <p className="center" style={{ color: 'var(--red-600)', fontSize: 13, marginTop: 8, marginBottom: 0 }}>{error}</p>}
    </>
  )
}
