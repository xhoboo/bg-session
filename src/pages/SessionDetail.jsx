import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { formatDateTime, playerCount, isSessionFull, mapsLink, formatDuration, hasSessionStarted, isSessionFinished } from '../lib/format'
import Avatar from '../components/Avatar'
import GameChip from '../components/GameChip'
import StarRating from '../components/StarRating'
import SessionChat from '../components/SessionChat'
import SessionParticipants from '../components/SessionParticipants'
import { useGameCatalog } from '../lib/useGameCatalog'

export default function SessionDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { catalog, loading: catalogLoading } = useGameCatalog()

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
      .select('id, user_id, rating, review, created_at, rater:profiles(nickname, display_name, avatar_url)')
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
    setError('')
    // First submission: insert the rating (review optional). Rating is required
    // and permanent. A guest can rate now and add a review later.
    if (!ratings.find((r) => r.user_id === user.id)) {
      if (ratingValue < 1) return setError('Please pick a star rating from 1 to 10.')
      setBusy(true)
      const { error } = await supabase
        .from('session_ratings')
        .insert({ session_id: id, user_id: user.id, rating: ratingValue, review: reviewText.trim() })
      setBusy(false)
      if (error) return setError(error.message)
      setReviewText('')
      return loadAll()
    }
    // Already rated: add the review to the existing row (rating stays as-is).
    const body = reviewText.trim()
    if (!body) return
    setBusy(true)
    const { error } = await supabase
      .from('session_ratings')
      .update({ review: body })
      .eq('session_id', id)
      .eq('user_id', user.id)
    setBusy(false)
    if (error) return setError(error.message)
    setReviewText('')
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

  const started = hasSessionStarted(session)
  const finished = isSessionFinished(session)
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
        {finished ? (
          <span className="badge badge-done">Done</span>
        ) : (
          <span className={'badge ' + (session.session_type === 'open' ? 'badge-open' : 'badge-approval')}>
            {session.session_type === 'open' ? 'Open' : 'Approval'}
          </span>
        )}
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
          {formatDuration(session.duration_minutes) && (
            <div className="row-between"><span className="muted">Duration</span><strong>{formatDuration(session.duration_minutes)}</strong></div>
          )}
          {session.region && (
            <div className="row-between"><span className="muted">Region</span><span className="badge badge-area">{session.region}</span></div>
          )}
          <div className="row-between"><span className="muted">Area</span><span className="badge badge-area">{session.area}</span></div>
          <div className="row-between"><span className="muted">Players</span><strong>{playerCount(session)}{isFull ? ' · full' : ''}{session.min_players > 1 ? ` · min ${session.min_players}` : ''}</strong></div>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>Board games</div>
            {session.board_games ? (
              <div className="chips">
                {session.board_games.split(',').map((g) => g.trim()).filter(Boolean).map((g) => (
                  <GameChip key={g} name={g} catalog={catalog} loading={catalogLoading} />
                ))}
              </div>
            ) : (
              <div>To be decided</div>
            )}
          </div>

          {/* Address is hidden once the session has finished — it's no longer useful. */}
          {!finished && (
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
          )}
        </div>
      </div>

      {/* ---------------- Ratings & reviews (finished sessions) ---------------- */}
      {finished && isParticipant && (
        <>
          <h2 className="section-title">Ratings & reviews</h2>
          <div className="card stack">
            {ratings.length >= 2 ? (
              <div className="rating-row">
                <StarRating value={Math.round(avgRating)} showvalue={false} />
                <strong>{avgRating}/10</strong>
                <span className="muted">· {ratings.length} ratings</span>
              </div>
            ) : ratings.length === 1 ? (
              // Keep a lone rating anonymous — the average would equal it.
              <p className="muted" style={{ margin: 0 }}>1 rating so far — the average appears once 2 or more people have rated.</p>
            ) : (
              <p className="muted" style={{ margin: 0 }}>No ratings yet — be the first.</p>
            )}

            <div style={{ borderTop: '1px solid var(--slate-100)', paddingTop: 14 }}>
              {/* Rating: editable until submitted, then permanent. Your score is
                  shown only to you; to everyone else your rating is anonymous. */}
              <div className="field-label" style={{ marginBottom: 8 }}>
                {myRating ? 'Your rating' : 'Rate this session'}
                {!myRating && <span className="field-hint"> — required for participants, and can’t be changed once sent</span>}
              </div>
              <div className="rating-row" style={{ marginBottom: 12 }}>
                {myRating
                  ? <StarRating value={myRating.rating} size={18} />
                  : <StarRating value={ratingValue} onChange={setRatingValue} />}
              </div>

              {/* Review: separate from the rating. The box stays until you send a
                  review (you can rate now and review later); then it's read-only. */}
              {myRating?.review ? (
                <div className="muted" style={{ fontSize: 14 }}>“{myRating.review}”</div>
              ) : (
                <div className="review-input-wrap">
                  <textarea
                    placeholder={myRating ? 'Add a review (optional)…' : 'Add a review now (optional)…'}
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                  />
                  <button
                    className="btn btn-primary btn-sm review-send-btn"
                    onClick={submitRating}
                    disabled={busy || (myRating ? !reviewText.trim() : ratingValue < 1)}
                    title={!myRating && ratingValue < 1 ? 'Pick a star rating first' : 'Send'}
                  >
                    Send
                  </button>
                </div>
              )}
            </div>

            {/* Reviews are attributed to the writer; the numeric ratings stay anonymous. */}
            {ratings.filter((r) => r.user_id !== user.id && r.review).length > 0 && (
              <div>
                {ratings.filter((r) => r.user_id !== user.id && r.review).map((r) => (
                  <div className="review-item" key={r.id}>
                    <Link to={`/users/${r.user_id}`} className="user-link">
                      <Avatar name={r.rater?.nickname || r.rater?.display_name || 'Player'} src={r.rater?.avatar_url} size={24} />
                      {r.rater?.nickname || r.rater?.display_name || 'Player'}
                    </Link>
                    <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>{r.review}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ---------------- Guest actions (only before the session starts) ---------------- */}
      {!isHost && !started && (
        <div className="card">
          {!myRequest && !started && (
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

      {/* ---------------- Host management (only before the session starts) ---------------- */}
      {isHost && !started && (
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

      {isParticipant && <SessionParticipants sessionId={id} hostId={session.host_id} />}

      {isParticipant && <SessionChat sessionId={id} readOnly={finished} />}
    </div>
  )
}
