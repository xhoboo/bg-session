import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { formatDateTime, playerCount, isSessionFull, mapsLink } from '../lib/format'
import Avatar from '../components/Avatar'
import StarRating from '../components/StarRating'

export default function SessionDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [session, setSession] = useState(null)
  const [address, setAddress] = useState(null)
  const [myRequest, setMyRequest] = useState(null)
  const [requests, setRequests] = useState([]) // host view
  const [message, setMessage] = useState('')
  const [ratings, setRatings] = useState([])
  const [ratingValue, setRatingValue] = useState(0)
  const [reviewText, setReviewText] = useState('')
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
      .select('full_address, maps_url')
      .eq('session_id', id)
      .maybeSingle()
    setAddress(addr ?? null)

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

    // Ratings — RLS returns rows only to participants of this session.
    const { data: rts } = await supabase
      .from('session_ratings')
      .select('id, user_id, rating, review, created_at, rater:profiles(display_name, avatar_url)')
      .eq('session_id', id)
      .order('created_at', { ascending: false })
    setRatings(rts ?? [])
    const own = (rts ?? []).find((r) => r.user_id === user.id)
    setRatingValue(own?.rating ?? 0)
    setReviewText(own?.review ?? '')

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

  const submitRating = async () => {
    if (ratingValue < 1) return setError('Please pick a star rating from 1 to 10.')
    setBusy(true)
    setError('')
    const { error } = await supabase
      .from('session_ratings')
      .upsert(
        { session_id: id, user_id: user.id, rating: ratingValue, review: reviewText.trim() },
        { onConflict: 'session_id,user_id' },
      )
    setBusy(false)
    if (error) return setError(error.message)
    await loadAll()
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

  const isFull = isSessionFull(session)
  const pending = requests.filter((r) => r.status === 'pending')
  const approved = requests.filter((r) => r.status === 'approved')

  const isPast = new Date(session.starts_at) < new Date()
  const isParticipant = isHost || myRequest?.status === 'approved'
  const myRating = ratings.find((r) => r.user_id === user.id)
  const avgRating = ratings.length
    ? (ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length).toFixed(1)
    : null

  return (
    <div className="container container-narrow">
      <Link to="/" className="muted" style={{ fontSize: 14 }}>← Back to browse</Link>

      <div className="row-between" style={{ marginTop: 12 }}>
        <h1 style={{ marginBottom: 0 }}>{session.title}</h1>
        <span className={'badge ' + (session.session_type === 'open' ? 'badge-open' : 'badge-approval')}>
          {session.session_type === 'open' ? 'Open' : 'Approval'}
        </span>
      </div>
      <p className="subtitle" style={{ marginTop: 8 }}>
        Hosted by{' '}
        <Link to={`/users/${session.host_id}`} className="user-link">
          <Avatar name={session.host?.display_name || 'Host'} src={session.host?.avatar_url} size={24} />
          {session.host?.display_name || 'Host'}
        </Link>
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="stack">
          <div className="row-between"><span className="muted">When</span><strong>{formatDateTime(session.starts_at)}</strong></div>
          <div className="row-between"><span className="muted">Area</span><span className="badge badge-area">{session.area}</span></div>
          <div className="row-between"><span className="muted">Players</span><strong>{playerCount(session)}{isFull ? ' · full' : ''}</strong></div>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>Board games</div>
            <div>{session.board_games || 'To be decided'}</div>
          </div>

          <div>
            <div className="muted" style={{ marginBottom: 4 }}>Address</div>
            {address ? (
              <div className="address-box">
                <div>📍 {address.full_address}</div>
                <a
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: 10 }}
                  href={mapsLink(address.full_address, address.maps_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  🗺️ Open in Google Maps
                </a>
              </div>
            ) : (
              <div className="address-locked">🔒 The full address is revealed once the host confirms your spot.</div>
            )}
          </div>
        </div>
      </div>

      {/* ---------------- Ratings & reviews (past sessions) ---------------- */}
      {isPast && isParticipant && (
        <>
          <h2 className="section-title">Ratings & reviews</h2>
          <div className="card stack">
            {avgRating ? (
              <div className="rating-row">
                <StarRating value={Math.round(avgRating)} showvalue={false} />
                <strong>{avgRating}/10</strong>
                <span className="muted">· {ratings.length} {ratings.length === 1 ? 'rating' : 'ratings'}</span>
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>No ratings yet — be the first.</p>
            )}

            <div style={{ borderTop: '1px solid var(--slate-100)', paddingTop: 14 }}>
              <div className="field-label" style={{ marginBottom: 8 }}>
                {myRating ? 'Your rating' : 'Rate this session'}
                {!myRating && <span className="field-hint"> — required for participants</span>}
              </div>
              <div className="rating-row" style={{ marginBottom: 10 }}>
                <StarRating value={ratingValue} onChange={setRatingValue} />
              </div>
              <textarea
                placeholder="Add a review (optional)…"
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
              />
              <div className="spacer" />
              <button className="btn btn-primary" onClick={submitRating} disabled={busy}>
                {myRating ? 'Update my rating' : 'Submit rating'}
              </button>
            </div>

            {ratings.filter((r) => r.user_id !== user.id).length > 0 && (
              <div>
                {ratings.filter((r) => r.user_id !== user.id).map((r) => (
                  <div className="review-item" key={r.id}>
                    <div className="rating-row">
                      <Link to={`/users/${r.user_id}`} className="user-link">
                        <Avatar name={r.rater?.display_name || 'Player'} src={r.rater?.avatar_url} size={24} />
                        {r.rater?.display_name || 'Player'}
                      </Link>
                      <StarRating value={r.rating} size={15} />
                    </div>
                    {r.review && <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>{r.review}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ---------------- Guest actions ---------------- */}
      {!isHost && (myRequest || !isPast) && (
        <div className="card">
          {!myRequest && !isPast && (
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
                  <Link to={`/users/${r.guest_id}`} className="user-link">
                    <Avatar name={r.guest?.display_name || 'Guest'} src={r.guest?.avatar_url} size={32} />
                  </Link>
                  <div>
                    <Link to={`/users/${r.guest_id}`} className="user-link"><strong>{r.guest?.display_name || 'Guest'}</strong></Link>
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
                    <Link to={`/users/${r.guest_id}`} className="user-link">
                      <Avatar name={r.guest?.display_name || 'Guest'} src={r.guest?.avatar_url} size={28} />
                      {r.guest?.display_name || 'Guest'}
                    </Link>
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
