import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import { formatDateTime, playerCount } from '../lib/format'

// Read-only profile display, shared by the user's own Profile page and the
// public /users/:id page. Public fields (avatar, nickname, games, history) are
// always shown. The private block (real name, gender, in-person photo) only
// renders when it's available — i.e. it's your own profile, or you share a
// confirmed session with this person (the data itself is gated by RLS).
export default function ProfileView({ profile, email, history = [] }) {
  if (!profile) return null
  const name = profile.nickname || profile.display_name || 'Player'
  const fav = profile.favorite_games || []
  const owned = profile.owned_games || []
  const hasPrivate = profile.real_name || profile.gender || profile.photo_url

  return (
    <>
      <div className="profile-view-head">
        <Avatar name={name} src={profile.avatar_url} size={88} />
        <h1 style={{ marginBottom: 2 }}>{name}</h1>
        {email && <p className="muted" style={{ margin: '2px 0 0', fontSize: 14 }}>{email}</p>}
      </div>

      {hasPrivate && (
        <div className="card stack">
          {profile.photo_url && (
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>In-person photo</div>
              <Avatar name={name} src={profile.photo_url} size={96} />
            </div>
          )}
          {profile.real_name && (
            <div className="row-between"><span className="muted">Real name</span><span>{profile.real_name}</span></div>
          )}
          {profile.gender && (
            <div className="row-between"><span className="muted">Gender</span><span>{profile.gender}</span></div>
          )}
        </div>
      )}

      <div className="card stack">
        <div>
          <div className="muted" style={{ marginBottom: 6 }}>Favorite board games</div>
          {fav.length ? (
            <div className="chips">{fav.map((g, i) => <span className="chip" key={i}>{g}</span>)}</div>
          ) : (
            <span className="muted">—</span>
          )}
        </div>
        <div>
          <div className="muted" style={{ marginBottom: 6 }}>Board games owned</div>
          {owned.length ? (
            <div className="chips">{owned.map((g, i) => <span className="chip chip-muted" key={i}>{g}</span>)}</div>
          ) : (
            <span className="muted">None</span>
          )}
        </div>
      </div>

      <h2 className="section-title">Session history</h2>
      {history.length === 0 ? (
        <p className="muted">No past sessions yet.</p>
      ) : (
        <div className="stack">
          {history.map(({ key, session, role }) => (
            <Link
              to={`/sessions/${session.id}`}
              key={key}
              className="card session-card"
              style={{ textDecoration: 'none', color: 'inherit', opacity: 0.85 }}
            >
              <div className="row-between">
                <span className="session-card-title">{session.title}</span>
                {role && <span className={'badge ' + (role === 'Hosted' ? 'badge-approval' : 'badge-approved')}>{role}</span>}
              </div>
              <div className="session-meta">
                <span>📅 {formatDateTime(session.starts_at)}</span>
                <span><span className="badge badge-area">{session.area}</span></span>
                <span>👥 {playerCount(session)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
