import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { formatDateTime } from '../lib/format'
import Avatar from '../components/Avatar'

export default function SessionDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [session, setSession] = useState(null)
  const [address, setAddress] = useState(null)
  const [myRequest, setMyRequest] = useState(null)
  const [requests, setRequests] = useState([]) // host view
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const isHost = session && user && session.host_id === user.id

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')

    const { data: s, error: sErr } = await supabase
      .from('sessions')
      .select('*, host:profiles(display_name, avatar_url)')
      .eq('id', id)
      .maybeSingle()

    if (sErr || !s) {
      setError(sErr?.message || 'Session not found.')
      setLoading(false)
      return
    }
    setSession(s)

    // Address — RLS returns a row only if we're the host or an approved guest.
    const { data: addr } = await supabase
      .from('session_addresses')
      .select('full_address')
      .eq('session_id', id)
      .maybeSingle()
    setAddress(addr?.full_address ?? null)

    if (s.host_id === user.id) {
      // Host: load every request with the guest's public name.
      const { data: reqs } = await supabase
        .from('join_requests')
        .select('*, guest:profiles(display_name, avatar_url)')
        .eq('session_id', id)
        .order('created_at', { ascending: true })
      setRequests(reqs ?? [])
    } else {
      // Guest: load only my own request, if any.
      const { data: mine } = await supabase
        .from('join_requests')
        .select('*')
        .eq('session_id', id)
        .eq('guest_id', user.id)
        .maybeSingle()
      setMyRequest(mine ?? null)
    }

    setLoading(false)
  }, [id, user.id])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const requestToJoin = async () => {
    setBusy(true)
    setError('')
    const { error } = await supabase
      .from('join_requests')
      .insert({ session_id: id, guest_id: user.id, message: message.trim() })
    setBusy(false)
    if (error) return setError(error.message)
    setMessage('')
    await loadAll()
  }

  const withdraw = async () => {
    setBusy(true)
    const { error } = await supabase.from('join_requests').delete().eq('id', myRequest.id)
    setBusy(false)
    if (error) return setError(error.message)
    await loadAll()
  }

  const decide = async (requestId, status) => {
    setBusy(true)
    setError('')
    const { error } = await supabase.from('join_requests').update({ status }).eq('id', requestId)
    setBusy(false)
    if (error) return setError(error.message)
    await loadAll()
  }

  const cancelSession = async () => {
    if (!window.confirm('Cancel this session? This removes it for everyone and notifies no one. This cannot be undone.')) return
    setBusy(true)
    setError('')
    const { error } = await supabase.from('sessions').delete().eq('id', id)
    setBusy(false)
    if (error) return setError(error.message)
    navigate('/my-sessions', { replace: true })
  }

  if (loading) return <div className="spinner" aria-label="Loading session" />
  if (error && !session) {
    return (
      <div className="container container-narrow">
        <div className="alert alert-error">{error}</div>
        <Link to="/" className="btn btn-secondary">← Back to browse</Link>
      </div>
    )
  }

  const isFull = session.confirmed_count >= session.max_players
  const pending = requests.filter((r) => r.status === 'pending')
  const approved = requests.filter((r) => r.status === 'approved')

  return (
    <div className="container container-narrow">
      <Link to="/" className="muted" style={{ fontSize: 14 }}>← Back to browse</Link>

      <div className="row-between" style={{ marginTop: 12 }}>
        <h1 style={{ marginBottom: 0 }}>{session.title}</h1>
        <span className={'badge ' + (session.session_type === 'open' ? 'badge-open' : 'badge-approval')}>
          {session.session_type === 'open' ? 'Open' : 'Approval'}
        </span>
      </div>
      <p className="subtitle" style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Avatar name={session.host?.display_name || 'Host'} src={session.host?.avatar_url} size={24} />
        Hosted by {session.host?.display_name || 'Host'}
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="stack">
          <div className="row-between"><span className="muted">When</span><strong>{formatDateTime(session.starts_at)}</strong></div>
          <div className="row-between"><span className="muted">Area</span><span className="badge badge-area">{session.area}</span></div>
          <div className="row-between"><span className="muted">Players</span><strong>{session.confirmed_count}/{session.max_players}{isFull ? ' · full' : ''}</strong></div>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>Board games</div>
            <div>{session.board_games || 'To be decided'}</div>
          </div>

          <div>
            <div className="muted" style={{ marginBottom: 4 }}>Address</div>
            {address ? (
              <div className="address-box">📍 {address}</div>
            ) : (
              <div className="address-locked">🔒 The full address is revealed once the host confirms your spot.</div>
            )}
          </div>
        </div>
      </div>

      {/* ---------------- Guest actions ---------------- */}
      {!isHost && (
        <div className="card">
          {!myRequest && (
            <>
              <h2 style={{ marginTop: 0, fontSize: 18 }}>Want to join?</h2>
              {isFull ? (
                <div className="alert alert-info">This session is full.</div>
              ) : (
                <>
                  <div className="form-group">
                    <label className="field-label" htmlFor="msg">
                      Message to host <span className="field-hint">(optional)</span>
                    </label>
                    <textarea
                      id="msg"
                      placeholder="Say hi, mention your experience level…"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                  </div>
                  <button className="btn btn-primary btn-block" onClick={requestToJoin} disabled={busy}>
                    {session.session_type === 'open' ? 'Join session' : 'Request to join'}
                  </button>
                </>
              )}
            </>
          )}

          {myRequest && myRequest.status === 'pending' && (
            <>
              <div className="row-between">
                <span>Your request is <span className="badge badge-pending">Pending</span></span>
                <button className="btn btn-danger btn-sm" onClick={withdraw} disabled={busy}>Withdraw</button>
              </div>
              <p className="muted" style={{ marginBottom: 0 }}>You'll be notified when the host responds.</p>
            </>
          )}

          {myRequest && myRequest.status === 'approved' && (
            <div className="row-between">
              <span>You're confirmed <span className="badge badge-approved">Approved</span></span>
              <button className="btn btn-danger btn-sm" onClick={withdraw} disabled={busy}>Cancel my spot</button>
            </div>
          )}

          {myRequest && myRequest.status === 'rejected' && (
            <span>Your request was <span className="badge badge-rejected">Declined</span></span>
          )}
        </div>
      )}

      {/* ---------------- Host management ---------------- */}
      {isHost && (
        <>
          <h2 className="section-title">Requests to join</h2>

          {pending.length === 0 && <p className="muted">No pending requests right now.</p>}
          {pending.map((r) => (
            <div className="card" key={r.id}>
              <div className="row-between">
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Avatar name={r.guest?.display_name || 'Guest'} src={r.guest?.avatar_url} size={32} />
                  <div>
                    <strong>{r.guest?.display_name || 'Guest'}</strong>
                    {r.message && <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>“{r.message}”</div>}
                  </div>
                </div>
                <span className="badge badge-pending">Pending</span>
              </div>
              <div className="spacer" />
              <div className="form-row">
                <button
                  className="btn btn-primary"
                  onClick={() => decide(r.id, 'approved')}
                  disabled={busy || isFull}
                  title={isFull ? 'Session is full' : ''}
                >
                  Approve
                </button>
                <button className="btn btn-danger" onClick={() => decide(r.id, 'rejected')} disabled={busy}>
                  Decline
                </button>
              </div>
              {isFull && <p className="muted" style={{ marginBottom: 0, marginTop: 8 }}>Session is full — increase max players to approve more.</p>}
            </div>
          ))}

          <h2 className="section-title">Confirmed guests ({approved.length})</h2>
          {approved.length === 0 ? (
            <p className="muted">No confirmed guests yet.</p>
          ) : (
            <div className="card">
              <div className="stack">
                {approved.map((r) => (
                  <div className="row-between" key={r.id}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <Avatar name={r.guest?.display_name || 'Guest'} src={r.guest?.avatar_url} size={28} />
                      {r.guest?.display_name || 'Guest'}
                    </span>
                    <span className="badge badge-approved">Approved</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h2 className="section-title">Manage session</h2>
          <div className="form-row">
            <button className="btn btn-secondary" onClick={() => navigate(`/sessions/${id}/edit`)} disabled={busy}>
              Edit details
            </button>
            <button className="btn btn-danger" onClick={cancelSession} disabled={busy}>
              Cancel session
            </button>
          </div>
        </>
      )}
    </div>
  )
}
