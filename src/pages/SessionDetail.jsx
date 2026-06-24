import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../lib/i18n'
import { formatDateTime, playerCount, isSessionFull, mapsLink, formatDuration, hasSessionStarted, isSessionFinished, gameAnchor, FALLBACK_DURATION_MIN } from '../lib/format'
import Avatar from '../components/Avatar'
import GameChip from '../components/GameChip'
import RecurrenceBadge from '../components/RecurrenceBadge'
import StarRating from '../components/StarRating'
import SessionChat from '../components/SessionChat'
import SessionParticipants from '../components/SessionParticipants'
import SessionBringList from '../components/SessionBringList'
import { useGameCatalog } from '../lib/useGameCatalog'
import { SessionDetailSkeleton } from '../components/Skeleton'
import ShareSessionButton from '../components/ShareSessionButton'
import { userPath } from '../lib/nickname'

export default function SessionDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { t } = useLang()
  const navigate = useNavigate()
  const { catalog, loading: catalogLoading } = useGameCatalog()

  const [session, setSession] = useState(null)
  const [address, setAddress] = useState(null)
  const [brought, setBrought] = useState([]) // games participants pledged to bring
  const [playsSummary, setPlaysSummary] = useState([]) // submitted game results (for the chips)
  const [myRequest, setMyRequest] = useState(null)
  const [requests, setRequests] = useState([]) // host view
  const [message, setMessage] = useState('')
  const [ratings, setRatings] = useState([])
  const [ratingValue, setRatingValue] = useState(0)
  const [reviewText, setReviewText] = useState('')
  const [cohostIds, setCohostIds] = useState(() => new Set())
  const [seriesEditable, setSeriesEditable] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // When arriving from the home "rate" card (…/sessions/:id#review), drop the
  // participant straight onto the optional written-review box once it mounts.
  const reviewRef = useRef(null)
  const reviewFocused = useRef(false)
  useEffect(() => {
    if (reviewFocused.current || window.location.hash !== '#review') return
    const el = reviewRef.current
    if (!el) return
    reviewFocused.current = true
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.focus({ preventScroll: true })
  }, [ratings])

  const isHost = session && user && session.host_id === user.id

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')

    const { data: s, error: sErr } = await supabase
      .from('sessions')
      .select('*, host:profiles(nickname, display_name, avatar_url)')
      .eq('id', id)
      .maybeSingle()

    if (sErr || !s) {
      setError(sErr?.message || 'Session not found.')
      setLoading(false)
      return
    }
    setSession(s)

    // Weekly: load the co-hosts (to badge them / gate co-host editing) and, for
    // host + co-hosts, the series' editable-field permissions.
    if (s.series_id) {
      const { data: chs } = await supabase.from('weekly_cohosts').select('user_id').eq('series_id', s.series_id)
      setCohostIds(new Set((chs ?? []).map((r) => r.user_id)))
      const { data: ws } = await supabase
        .from('weekly_series')
        .select('cohost_editable')
        .eq('id', s.series_id)
        .maybeSingle()
      setSeriesEditable(ws?.cohost_editable ?? [])
    } else {
      setCohostIds(new Set())
      setSeriesEditable([])
    }

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
        .select('*, guest:profiles(nickname, display_name, avatar_url)')
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

    // Games participants pledged to bring — RLS returns rows only to this
    // session's participants, so they fold into the board-games list for them.
    const { data: bg } = await supabase
      .from('session_brought_games')
      .select('id, game_name, user_id, bringer:profiles(nickname, display_name, avatar_url)')
      .eq('session_id', id)
      .order('created_at', { ascending: true })
    setBrought(bg ?? [])

    // Submitted game results — public, so the chips show for anyone. Just the
    // names here; the full breakdown lives on the score page.
    const { data: pl } = await supabase
      .from('session_game_plays')
      .select('id, game_name')
      .eq('session_id', id)
      .eq('status', 'submitted')
    setPlaysSummary(pl ?? [])

    setLoading(false)
  }, [id, user.id])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const requestToJoin = async () => {
    setBusy(true)
    setError('')

    // Instant feedback for the no-double-booking rule (also enforced by the DB
    // trigger in migration 0042). A "commitment" is a session you host or are
    // already approved into; pending/waitlist requests don't count.
    const dur = session.duration_minutes || FALLBACK_DURATION_MIN
    const start = new Date(session.starts_at).getTime()
    const end = start + dur * 60_000
    const [{ data: hosted }, { data: approved }] = await Promise.all([
      supabase.from('sessions').select('id, starts_at, duration_minutes').eq('host_id', user.id),
      supabase
        .from('join_requests')
        .select('session:sessions(id, starts_at, duration_minutes)')
        .eq('guest_id', user.id)
        .eq('status', 'approved'),
    ])
    const commitments = [...(hosted ?? []), ...(approved ?? []).map((r) => r.session).filter(Boolean)]
    const clash = commitments.some((s) => {
      if (s.id === session.id) return false
      const st = new Date(s.starts_at).getTime()
      const en = st + (s.duration_minutes || FALLBACK_DURATION_MIN) * 60_000
      return en > Date.now() && st < end && en > start
    })
    if (clash) {
      setBusy(false)
      return setError(t('You already have a session at this day and time. Leave that one first, or pick a session at a different time.'))
    }

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

  // Drop one of my own brought-game pledges (the × on its chip in the list).
  const removeBrought = async (bid) => {
    const { error } = await supabase.from('session_brought_games').delete().eq('id', bid)
    if (!error) setBrought((prev) => prev.filter((r) => r.id !== bid))
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
    const weekly = !!session.series_id
    const msg = weekly
      ? t("End this weekly session? This removes the upcoming session, stops it repeating, and notifies the confirmed guests. Past weeks stay in everyone's history.")
      : t('Cancel this session? This removes it for everyone and notifies the confirmed guests. This cannot be undone.')
    if (!window.confirm(msg)) return
    setBusy(true)
    setError('')
    // RPC notifies approved guests before deleting (and ends the series if weekly).
    const { error } = await supabase.rpc('cancel_session', { p_session_id: id })
    setBusy(false)
    if (error) return setError(error.message)
    navigate('/my-sessions', { replace: true })
  }

  // A co-host resigns: they're removed from the series and from this and any
  // upcoming occurrence (their past weeks stay in their history).
  const stepDown = async () => {
    if (!window.confirm(t('Step down as co-host? You will be removed from this and every upcoming week.'))) return
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('step_down_cohost', { p_series_id: session.series_id })
    setBusy(false)
    if (error) return setError(error.message)
    navigate('/my-sessions', { replace: true })
  }

  // Submit the star rating on its own. Rating is required and permanent; once
  // sent it can't be changed. A review can be added separately afterwards.
  const submitRating = async () => {
    setError('')
    if (ratings.find((r) => r.user_id === user.id)) return // already rated
    if (ratingValue < 1) return setError(t('Please pick a star rating from 1 to 10.'))
    setBusy(true)
    const { error } = await supabase
      .from('session_ratings')
      .insert({ session_id: id, user_id: user.id, rating: ratingValue })
    setBusy(false)
    if (error) return setError(error.message)
    await loadAll()
  }

  // Send the written review on its own — attached to the existing rating row.
  const submitReview = async () => {
    setError('')
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

  if (loading) return <SessionDetailSkeleton />
  if (error && !session) {
    return (
      <div className="container container-narrow">
        <div className="alert alert-error">{error}</div>
        <Link to="/" className="btn btn-secondary">{t('← Back to browse')}</Link>
      </div>
    )
  }

  const isFull = isSessionFull(session)
  const pending = requests.filter((r) => r.status === 'pending')
  const waitlisted = requests.filter((r) => r.status === 'waitlisted')
  // Both are awaiting the host: pending (a spot is free) and waitlisted (full —
  // approvable once a spot opens). Open sessions auto-promote, so their waitlist
  // is usually empty by the time the host looks.
  const actionable = [...pending, ...waitlisted]

  const started = hasSessionStarted(session)
  const finished = isSessionFinished(session)
  // Games that have at least one recorded result, with replay counts, keeping
  // the first spelling seen. Chips link to the score page.
  const scoreGames = (() => {
    const m = new Map()
    playsSummary.forEach((p) => {
      const low = p.game_name.toLowerCase()
      const cur = m.get(low)
      if (cur) cur.n += 1
      else m.set(low, { name: p.game_name, n: 1 })
    })
    return [...m.values()]
  })()
  // Host-listed games; brought pledges are deduped against these so nobody
  // pledges a game that's already on the bill.
  const listedGames = session.board_games
    ? session.board_games.split(',').map((g) => g.trim()).filter(Boolean)
    : []
  const isCohost = !isHost && cohostIds.has(user.id)
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
        <span style={{ display: 'inline-flex', gap: 6, flex: 'none' }}>
          <RecurrenceBadge session={session} />
          {finished ? (
            <span className="badge badge-done">{t('Done')}</span>
          ) : (
            <span className={'badge ' + (session.session_type === 'open' ? 'badge-open' : 'badge-approval')}>
              {session.session_type === 'open' ? t('Open') : t('Approval')}
            </span>
          )}
        </span>
      </div>
      <p className="subtitle" style={{ marginTop: 8 }}>
        {t('Hosted by')}{' '}
        <Link to={userPath(session.host?.nickname || session.host_id)} className="user-link">
          <Avatar name={session.host?.display_name || t('Host')} src={session.host?.avatar_url} size={24} />
          {session.host?.display_name || t('Host')}
        </Link>
      </p>

      <div className="detail-actions">
        <ShareSessionButton session={session} address={address} hostName={session.host?.display_name} />
        {isHost && !started && (
          <div className="detail-actions-right">
            <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/sessions/${id}/edit`)} disabled={busy}>
              {t('Edit details')}
            </button>
            <button className="btn btn-danger btn-sm" onClick={cancelSession} disabled={busy}>
              {session.series_id ? t('End weekly session') : t('Cancel session')}
            </button>
          </div>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="stack">
          <div className="row-between"><span className="muted">{t('When')}</span><strong>{formatDateTime(session.starts_at)}</strong></div>
          {formatDuration(session.duration_minutes) && (
            <div className="row-between"><span className="muted">{t('Duration')}</span><strong>{formatDuration(session.duration_minutes)}</strong></div>
          )}
          {session.region && (
            <div className="row-between"><span className="muted">{t('Region')}</span><span className="badge badge-area">{session.region}</span></div>
          )}
          {session.area && (
            <div className="row-between"><span className="muted">{t('Area')}</span><span className="badge badge-area">{session.area}</span></div>
          )}
          <div className="row-between"><span className="muted">{t('Players')}</span><strong>{playerCount(session)}{isFull ? ` ${t('· full')}` : ''}{session.min_players > 1 ? ` ${t('· min {n}', { n: session.min_players })}` : ''}</strong></div>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>{t('Board games')}</div>
            {listedGames.length > 0 || brought.length > 0 ? (
              <div className="chips">
                {listedGames.map((g) => (
                  <GameChip key={g} name={g} catalog={catalog} loading={catalogLoading} />
                ))}
                {/* Games a participant pledged to bring — shown with the bringer's
                    avatar so everyone sees the full table at a glance. */}
                {brought.map((r) => {
                  const bn = r.bringer?.nickname || r.bringer?.display_name || t('Player')
                  const mine = r.user_id === user.id
                  // Like any other game, a brought game links to its catalog page
                  // when we can match it; otherwise it stays plain text.
                  const canonical = catalog.get(r.game_name.trim().toLowerCase())
                  return (
                    <span className="chip chip-bring" key={r.id} title={t('Brought by {name}', { name: bn })}>
                      {canonical ? (
                        <Link to={`/games/${encodeURIComponent(canonical)}`} className="chip-bring-name">{canonical}</Link>
                      ) : (
                        r.game_name
                      )}
                      <Avatar name={bn} src={r.bringer?.avatar_url} size={18} />
                      {mine && !finished && (
                        <button type="button" className="chip-x" onClick={() => removeBrought(r.id)} aria-label={`Remove ${r.game_name}`}>×</button>
                      )}
                    </span>
                  )
                })}
              </div>
            ) : (
              <div>{t('To be decided')}</div>
            )}
          </div>

          {/* Address is hidden once the session has finished — it's no longer useful. */}
          {!finished && (
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>{t('Address')}</div>
              {address ? (
                <div className="address-box">
                  <div>📍 {address.full_address}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                    <a
                      className="btn btn-secondary btn-sm"
                      href={mapsLink(address.full_address, address.maps_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('🗺️ Open in Google Maps')}
                    </a>
                    {/* Safety: let the guest send where they'll be to a friend. */}
                    <ShareSessionButton
                      session={session}
                      address={address}
                      hostName={session.host?.display_name}
                      label="Share with a friend"
                    />
                  </div>
                </div>
              ) : (
                <div className="address-locked">{t('🔒 The full address is revealed once the host confirms your spot.')}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---------------- Game results / scores (once the session has started) ----------------
          Just the chips of games that already have a recorded result; each one
          deep-links to its card on the score page. Recording lives on the FAB. */}
      {started && scoreGames.length > 0 && (
        <>
          <h2 className="section-title">{t('Game results')}</h2>
          <div className="card">
            <div className="chips">
              {scoreGames.map((g) => {
                const canonical = catalog.get(g.name.trim().toLowerCase())
                return (
                  <Link key={g.name} to={`/sessions/${id}/score?game=${gameAnchor(g.name)}`} className="chip chip-score">
                    <span>{canonical || g.name}</span>
                    {g.n > 1 && <span className="chip-count">×{g.n}</span>}
                  </Link>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* ---------------- Ratings & reviews (finished sessions) ---------------- */}
      {finished && isParticipant && (
        <>
          <h2 className="section-title">{t('Ratings & reviews')}</h2>
          <div className="card stack">
            {ratings.length >= 1 ? (
              <div className="rating-row">
                <StarRating value={Math.round(avgRating)} showValue={false} />
                <strong>{avgRating}/10</strong>
                {/* Hide the count below 3 ratings: with only the average shown and
                    no count, a lone rating can't be singled out. */}
                {ratings.length >= 3 && <span className="muted">{t('· {n} ratings', { n: ratings.length })}</span>}
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>{t('No ratings yet — be the first.')}</p>
            )}

            <div style={{ borderTop: '1px solid var(--slate-100)', paddingTop: 14 }}>
              {/* Rating: editable until submitted, then permanent. Your score is
                  shown only to you; to everyone else your rating is anonymous. */}
              <div className="field-label" style={{ marginBottom: 8 }}>
                {myRating ? t('Your rating') : t('Rate this session')}
                {!myRating && <span className="field-hint"> {t('— required for participants, and can’t be changed once sent')}</span>}
              </div>
              <div className="rating-row" style={{ marginBottom: 12 }}>
                {myRating ? (
                  <StarRating value={myRating.rating} size={18} />
                ) : (
                  <>
                    <StarRating value={ratingValue} onChange={setRatingValue} />
                    {/* Submit button sits right beside the stars it sends. */}
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={submitRating}
                      disabled={busy || ratingValue < 1}
                      title={ratingValue < 1 ? t('Pick a star rating first') : t('Submit rating')}
                    >
                      {t('Submit rating')}
                    </button>
                  </>
                )}
              </div>

              {/* Review: a separate, optional step that's only available once
                  you've rated. Stays editable until sent, then read-only. */}
              {myRating?.review ? (
                <div className="muted" style={{ fontSize: 14 }}>“{myRating.review}”</div>
              ) : myRating ? (
                <div className="review-input-wrap">
                  <textarea
                    ref={reviewRef}
                    placeholder={t('Add a review (optional)…')}
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                  />
                  <button
                    className="btn btn-primary btn-sm review-send-btn"
                    onClick={submitReview}
                    disabled={busy || !reviewText.trim()}
                  >
                    {t('Send review')}
                  </button>
                </div>
              ) : (
                <p className="muted" style={{ margin: 0, fontSize: 14 }}>{t('You can add a written review after you submit your rating.')}</p>
              )}
            </div>

            {/* Reviews are attributed to the writer; the numeric ratings stay anonymous. */}
            {ratings.filter((r) => r.user_id !== user.id && r.review).length > 0 && (
              <div>
                {ratings.filter((r) => r.user_id !== user.id && r.review).map((r) => (
                  <div className="review-item" key={r.id}>
                    <Link to={userPath(r.rater?.nickname || r.user_id)} className="user-link">
                      <Avatar name={r.rater?.nickname || r.rater?.display_name || t('Player')} src={r.rater?.avatar_url} size={24} />
                      {r.rater?.nickname || r.rater?.display_name || t('Player')}
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
              <h2 style={{ marginTop: 0, fontSize: 18 }}>
                {isFull ? t('Session full — join the waitlist?') : t('Want to join?')}
              </h2>
              {isFull && (
                <p className="muted" style={{ marginTop: 0 }}>
                  {session.session_type === 'open'
                    ? t("We'll confirm you automatically the moment a spot opens.")
                    : t('The host can approve you from the waitlist when a spot opens.')}
                </p>
              )}
              <div className="form-group">
                <label className="field-label" htmlFor="msg">
                  {t('Message to host')} <span className="field-hint">{t('(optional)')}</span>
                </label>
                <textarea
                  id="msg"
                  placeholder={t('Say hi, mention your experience level…')}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
              <button className="btn btn-primary btn-block" onClick={requestToJoin} disabled={busy}>
                {isFull ? t('Join waitlist') : session.session_type === 'open' ? t('Join session') : t('Request to join')}
              </button>
            </>
          )}

          {myRequest && myRequest.status === 'pending' && (
            <>
              <div className="row-between">
                <span>{t('Your request is')} <span className="badge badge-pending">{t('Pending')}</span></span>
                <button className="btn btn-danger btn-sm" onClick={withdraw} disabled={busy}>{t('Withdraw')}</button>
              </div>
              <p className="muted" style={{ marginBottom: 0 }}>{t("You'll be notified when the host responds.")}</p>
            </>
          )}

          {myRequest && myRequest.status === 'approved' && (
            <div className="row-between">
              <span>{t("You're confirmed")} <span className="badge badge-approved">{t('Approved')}</span></span>
              <button className="btn btn-danger btn-sm" onClick={withdraw} disabled={busy}>{t('Cancel my spot')}</button>
            </div>
          )}

          {myRequest && myRequest.status === 'rejected' && (
            <span>{t('Your request was')} <span className="badge badge-rejected">{t('Declined')}</span></span>
          )}

          {myRequest && myRequest.status === 'waitlisted' && (
            <>
              <div className="row-between">
                <span>{t("You're on the")} <span className="badge badge-pending">{t('Waitlist')}</span></span>
                <button className="btn btn-danger btn-sm" onClick={withdraw} disabled={busy}>{t('Leave waitlist')}</button>
              </div>
              <p className="muted" style={{ marginBottom: 0 }}>
                {session.session_type === 'open'
                  ? t("We'll confirm you automatically the moment a spot opens — you'll get a notification.")
                  : t('The host can approve you from the waitlist once a spot opens.')}
              </p>
            </>
          )}
        </div>
      )}

      {/* ---------------- Host management (only before the session starts) ---------------- */}
      {isHost && !started && (
        <>
          <h2 className="section-title">
            {waitlisted.length > 0
              ? t('Requests to join · {n} on waitlist', { n: waitlisted.length })
              : t('Requests to join')}
          </h2>

          {actionable.length === 0 && <p className="muted">{t('No pending requests right now.')}</p>}
          {actionable.map((r) => (
            <div className="card" key={r.id}>
              <div className="row-between">
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Link to={userPath(r.guest?.nickname || r.guest_id)} className="user-link">
                    <Avatar name={r.guest?.display_name || 'Guest'} src={r.guest?.avatar_url} size={32} />
                  </Link>
                  <div>
                    <Link to={userPath(r.guest?.nickname || r.guest_id)} className="user-link"><strong>{r.guest?.display_name || 'Guest'}</strong></Link>
                    {r.message && <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>“{r.message}”</div>}
                  </div>
                </div>
                <span className={'badge ' + (r.status === 'waitlisted' ? 'badge-onetime' : 'badge-pending')}>
                  {r.status === 'waitlisted' ? t('Waitlist') : t('Pending')}
                </span>
              </div>
              <div className="spacer" />
              <div className="form-row">
                <button
                  className="btn btn-primary"
                  onClick={() => decide(r.id, 'approved')}
                  disabled={busy || isFull}
                  title={isFull ? t('Session is full') : ''}
                >
                  {t('Approve')}
                </button>
                <button className="btn btn-danger" onClick={() => decide(r.id, 'rejected')} disabled={busy}>
                  {t('Decline')}
                </button>
              </div>
              {isFull && <p className="muted" style={{ marginBottom: 0, marginTop: 8 }}>{t('Session is full — increase max players to approve more.')}</p>}
            </div>
          ))}
        </>
      )}

      {/* ---------------- Co-host controls (weekly sessions) ---------------- */}
      {isCohost && !started && (
        <>
          <h2 className="section-title">{t('Co-host')}</h2>
          <div className="card">
            <p className="muted" style={{ marginTop: 0 }}>
              {t("You're a co-host of this weekly session.")}
              {seriesEditable.length === 0 && t(' The host hasn’t given you edit permissions.')}
            </p>
            <div className="form-row">
              {seriesEditable.length > 0 && (
                <button className="btn btn-secondary" onClick={() => navigate(`/sessions/${id}/edit`)} disabled={busy}>
                  {t('Edit details')}
                </button>
              )}
              <button className="btn btn-danger" onClick={stepDown} disabled={busy}>
                {t('Step down')}
              </button>
            </div>
          </div>
        </>
      )}

      {isParticipant && <SessionParticipants sessionId={id} hostId={session.host_id} seriesId={session.series_id} />}

      {/* Bringing a game only makes sense before the session starts — once it's
          under way the line-up is set, so the add-a-game form drops away. */}
      {isParticipant && !started && (
        <SessionBringList sessionId={id} brought={brought} setBrought={setBrought} sessionGames={listedGames} />
      )}

      {isParticipant && <SessionChat sessionId={id} readOnly={finished} />}
    </div>
  )
}
