import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../lib/i18n'
import { useDebouncedCallback } from '../lib/useDebouncedCallback'
import { userPath } from '../lib/nickname'
import { Link } from 'react-router-dom'
import Avatar from './Avatar'

// Shown to confirmed participants (host + approved guests) of an upcoming
// session: search a member by name and invite them. The invite is a nudge — the
// invitee still joins through the normal request flow (the DB enforces capacity,
// approval, and the no-double-booking rule), so the host keeps control of who
// actually gets in. Invites the current user can see (their own sent ones, or —
// for the host — every invite for the session) are listed below the search.
export default function InviteMemberBox({ sessionId }) {
  const { user } = useAuth()
  const { t } = useLang()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [invites, setInvites] = useState([])
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const latest = useRef('')

  const loadInvites = useCallback(async () => {
    const { data } = await supabase
      .from('session_invites')
      .select('id, status, inviter_id, invitee_id, invitee:profiles!session_invites_invitee_id_fkey(nickname, display_name, avatar_url)')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
    setInvites(data ?? [])
  }, [sessionId])

  useEffect(() => {
    loadInvites()
  }, [loadInvites])

  // Debounced member search (same shape as the header GlobalSearch). Exclude
  // myself; the DB rejects inviting the host or an existing participant.
  const run = useDebouncedCallback(async (q) => {
    const safe = q.replace(/[,()]/g, ' ').trim()
    if (!safe) {
      setResults([])
      setSearching(false)
      return
    }
    const { data } = await supabase
      .from('profiles')
      .select('id, nickname, display_name, avatar_url')
      .or(`nickname.ilike.%${safe}%,display_name.ilike.%${safe}%`)
      .neq('id', user.id)
      .limit(6)
    if (q !== latest.current) return
    setResults(data ?? [])
    setSearching(false)
  })

  const onChange = (val) => {
    setQuery(val)
    setMsg('')
    setError('')
    const term = val.trim()
    latest.current = term
    if (!term) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    run(term)
  }

  const invite = async (member) => {
    setBusy(true)
    setError('')
    setMsg('')
    const { error: insErr } = await supabase
      .from('session_invites')
      .insert({ session_id: sessionId, inviter_id: user.id, invitee_id: member.id })
    setBusy(false)
    const name = member.nickname || member.display_name || t('this member')
    if (insErr) {
      // Unique violation = already invited; otherwise surface the trigger's
      // friendly message (already in the session, started, etc.).
      setError(insErr.code === '23505' ? t('{name} has already been invited.', { name }) : insErr.message)
      return
    }
    setMsg(t('Invited {name}.', { name }))
    setQuery('')
    setResults([])
    latest.current = ''
    loadInvites()
  }

  const rescind = async (id) => {
    setBusy(true)
    const { error: delErr } = await supabase.from('session_invites').delete().eq('id', id)
    setBusy(false)
    if (delErr) return setError(delErr.message)
    loadInvites()
  }

  const statusLabel = (s) => (s === 'accepted' ? t('Joined') : s === 'declined' ? t('Declined') : t('Invited'))

  return (
    <>
      <h2 className="section-title">{t('Invite a Member')}</h2>
      <div className="invite-search">
        <input
          type="text"
          placeholder={t('Search a member by name…')}
          value={query}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
        />
        {query.trim() && (
          <div className="invite-results">
            {searching ? (
              <p className="search-hint">{t('Searching…')}</p>
            ) : results.length === 0 ? (
              <p className="search-hint">{t('No members match “{term}”.', { term: query.trim() })}</p>
            ) : (
              results.map((m) => {
                const nm = m.nickname || m.display_name || t('Player')
                return (
                  <div key={m.id} className="invite-result">
                    <Avatar name={nm} src={m.avatar_url} size={30} />
                    <span className="invite-result-name">{nm}</span>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => invite(m)} disabled={busy}>
                      {t('Invite')}
                    </button>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {msg && <div className="alert alert-success" style={{ margin: '10px 0 0' }}>{msg}</div>}
      {error && <div className="alert alert-error" style={{ margin: '10px 0 0' }}>{error}</div>}

      {invites.length > 0 && (
        <div className="invite-list">
          {invites.map((iv) => {
            const nm = iv.invitee?.nickname || iv.invitee?.display_name || t('Player')
            const canRescind = iv.status === 'pending' && iv.inviter_id === user.id
            return (
              <div key={iv.id} className="invite-row">
                <Link to={userPath(iv.invitee?.nickname || iv.invitee_id)} className="user-link">
                  <Avatar name={nm} src={iv.invitee?.avatar_url} size={24} />
                  {nm}
                </Link>
                <span className="muted" style={{ fontSize: 13 }}>{statusLabel(iv.status)}</span>
                {canRescind && (
                  <button type="button" className="chip-x" onClick={() => rescind(iv.id)} disabled={busy} aria-label={t('Rescind Invite')}>×</button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
