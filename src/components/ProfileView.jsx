import { useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import GameChip from './GameChip'
import { useGameCatalog } from '../lib/useGameCatalog'
import { formatDateTime, playerCount, lastSeen } from '../lib/format'

const PAGE_SIZE = 10

// Read-only profile display, shared by the user's own Profile page and the
// public /users/:id page. Only public fields are shown here — the private
// "additional info" (real name, gender, in-person photo) is never rendered on
// a profile; it surfaces only to confirmed co-participants inside a session.
// `headerAction` is an optional node rendered just under the nickname (e.g. a
// "Message" button on someone else's profile).
export default function ProfileView({ profile, email, history = [], headerAction }) {
  const [page, setPage] = useState(0)
  const { catalog, loading: catalogLoading } = useGameCatalog()
  if (!profile) return null

  const name = profile.nickname || profile.display_name || 'Player'
  const fav = profile.favorite_games || []
  const owned = profile.owned_games || []
  const seen = lastSeen(profile.last_seen_at)

  // Clamp so a stale page (e.g. after switching to a profile with shorter
  // history) can never strand the user on an empty page.
  const pageCount = Math.max(1, Math.ceil(history.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const pageItems = history.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)

  return (
    <>
      <div className="profile-view-head">
        <Avatar name={name} src={profile.avatar_url} size={88} />
        <div className="name-row">
          <h1 style={{ margin: 0 }}>{name}</h1>
          <span className={'last-seen' + (seen.online ? ' is-online' : '')} title={seen.label}>
            <span className="last-seen-dot" />{seen.label}
          </span>
        </div>
        {profile.domicile && <p className="muted" style={{ margin: '2px 0 0' }}>📍 {profile.domicile}</p>}
        {email && <p className="muted" style={{ margin: '2px 0 0', fontSize: 14 }}>{email}</p>}
        {headerAction && <div style={{ marginTop: 10 }}>{headerAction}</div>}
      </div>

      <div className="card stack">
        <div>
          <div className="muted" style={{ marginBottom: 6 }}>Favorite board games</div>
          {fav.length ? (
            <div className="chips">{fav.map((g) => (
              <GameChip key={g} name={g} catalog={catalog} loading={catalogLoading} />
            ))}</div>
          ) : (
            <span className="muted">—</span>
          )}
        </div>
        <div>
          <div className="muted" style={{ marginBottom: 6 }}>Board games owned</div>
          {owned.length ? (
            <div className="chips">{owned.map((g) => (
              <GameChip key={g} name={g} catalog={catalog} loading={catalogLoading} muted />
            ))}</div>
          ) : (
            <span className="muted">None</span>
          )}
        </div>
      </div>

      <h2 className="section-title">Session history</h2>
      {history.length === 0 ? (
        <p className="muted">No past sessions yet.</p>
      ) : (
        <>
          <div className="stack">
            {pageItems.map(({ key, session, role, rating }) => (
              <Link
                to={`/sessions/${session.id}`}
                key={key}
                className="card session-card"
                style={{ textDecoration: 'none', color: 'inherit', opacity: 0.85 }}
              >
                <div className="row-between">
                  <span className="session-card-title">{session.title}</span>
                  {role && <span className={'badge ' + (role === 'Host' ? 'badge-approval' : 'badge-approved')}>{role}</span>}
                </div>
                <div className="session-meta">
                  <span>📅 {formatDateTime(session.starts_at)}</span>
                  <span><span className="badge badge-area">{session.area}</span></span>
                  <span>👥 {playerCount(session)}</span>
                  {rating && <span><span className="star on">★</span> {rating}/10</span>}
                </div>
              </Link>
            ))}
          </div>

          {pageCount > 1 && (
            <div className="pager">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setPage(Math.max(0, current - 1))}
                disabled={current === 0}
              >
                ← Newer
              </button>
              <span className="muted" style={{ fontSize: 13 }}>Page {current + 1} of {pageCount}</span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setPage(Math.min(pageCount - 1, current + 1))}
                disabled={current >= pageCount - 1}
              >
                Older →
              </button>
            </div>
          )}
        </>
      )}
    </>
  )
}
