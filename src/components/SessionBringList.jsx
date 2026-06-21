import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../lib/i18n'
import Avatar from './Avatar'

// Confirmed participants pledge which board games they'll bring to a session, so
// the table is covered without duplicates. Quick-add pulls from the player's own
// collection (profiles.owned_games); freeform names are allowed too. Visibility
// + write access are enforced by session_brought_games RLS (migration 0039).
export default function SessionBringList({ sessionId, readOnly = false }) {
  const { user, profile } = useAuth()
  const { t } = useLang()
  const [rows, setRows] = useState([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    supabase
      .from('session_brought_games')
      .select('id, game_name, user_id, bringer:profiles(nickname, display_name, avatar_url)')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (active) setRows(data ?? [])
      })
    return () => {
      active = false
    }
  }, [sessionId])

  const mineLower = new Set(rows.filter((r) => r.user_id === user.id).map((r) => r.game_name.toLowerCase()))
  // Games from my collection I haven't pledged here yet — offered as quick adds.
  const quickAdd = (profile?.owned_games ?? []).filter((g) => !mineLower.has(g.toLowerCase()))

  const add = async (name) => {
    const n = name.trim()
    if (!n || mineLower.has(n.toLowerCase())) return
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
    if (data) setRows((prev) => [...prev, data])
  }

  const remove = async (id) => {
    setBusy(true)
    const { error } = await supabase.from('session_brought_games').delete().eq('id', id)
    setBusy(false)
    if (!error) setRows((prev) => prev.filter((r) => r.id !== id))
  }

  // Group pledges by game so multiple bringers of the same title sit together.
  const byGame = new Map()
  for (const r of rows) {
    if (!byGame.has(r.game_name)) byGame.set(r.game_name, [])
    byGame.get(r.game_name).push(r)
  }

  return (
    <>
      <h2 className="section-title">{t('Games being brought')}</h2>
      {rows.length === 0 ? (
        <p className="muted" style={{ marginTop: -4 }}>
          {t('Nothing pledged yet.')}{!readOnly && t(' Add what you can bring so nobody doubles up.')}
        </p>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {[...byGame.entries()].map(([game, list]) => (
            <div className="card" key={game} style={{ padding: 12 }}>
              <strong>🎲 {game}</strong>
              <div className="member-grid" style={{ marginTop: 8 }}>
                {list.map((r) => {
                  const name = r.bringer?.nickname || r.bringer?.display_name || 'Player'
                  const mine = r.user_id === user.id
                  return (
                    <span className="member-card" key={r.id}>
                      <Avatar name={name} src={r.bringer?.avatar_url} size={24} />
                      <span className="member-name">{name}{mine ? ' · you' : ''}</span>
                      {mine && !readOnly && (
                        <button type="button" className="chip-x" onClick={() => remove(r.id)} aria-label={`Remove ${game}`}>×</button>
                      )}
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        <div style={{ marginTop: 12 }}>
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
        </div>
      )}
    </>
  )
}
