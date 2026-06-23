import { useEffect, useState } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { UUID_RE } from '../lib/nickname'
import ProfileView from '../components/ProfileView'
import { ProfileSkeleton } from '../components/Skeleton'

// Public, read-only view of another player's profile (linked from sessions).
// Only public fields are shown — real name / in-person photo are
// never displayed here; they appear only to confirmed co-participants inside a
// session. Session history (finished sessions hosted AND joined) comes from the
// user_session_history() function, which exposes only public session fields.
export default function UserProfile() {
  // The URL carries the nickname now (e.g. /users/Andi); older shared links
  // still pass the raw user id. We resolve either to a profile below.
  const { id: handle } = useParams()
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    setProfile(null)
    ;(async () => {
      // Look the player up by id for legacy UUID links, otherwise by their
      // unique (case-insensitive) nickname. Escape ILIKE wildcards so a literal
      // _ in a nickname matches literally instead of acting as a wildcard.
      const q = supabase
        .from('profiles')
        .select('id, display_name, nickname, avatar_url, domicile, favorite_games, owned_games, last_seen_at')
      const pubRes = UUID_RE.test(handle)
        ? await q.eq('id', handle).maybeSingle()
        : await q.ilike('nickname', handle.replace(/[\\%_]/g, '\\$&')).maybeSingle()
      const prof = pubRes.data ?? null

      // History keys off the resolved id, so fetch it only once we have a hit.
      let rows = []
      if (prof) {
        const histRes = await supabase.rpc('user_session_history', { uid: prof.id })
        rows = (histRes.data ?? []).sort((a, b) => (a.starts_at < b.starts_at ? 1 : -1))
      }

      if (!active) return
      setProfile(prof)
      // avg_rating is an anonymous aggregate from user_session_history (0022);
      // show it on the card front, formatted like the own-profile history.
      setHistory(rows.map((s) => ({
        key: s.role + s.id,
        session: s,
        role: s.role,
        rating: s.avg_rating != null ? Number(s.avg_rating).toFixed(1) : null,
      })))
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [handle])

  // "Last seen" is relative to now, but we only fetch it once on load and the
  // page never re-renders on its own — so the status would freeze (e.g. stuck
  // on "Online now"). Re-fetch last_seen_at periodically (while the tab is
  // visible) so it decays to "Last seen Xm ago" when they go idle, and bumps
  // back to "Online now" if they return.
  const profileId = profile?.id
  useEffect(() => {
    if (!profileId) return
    let active = true
    const timer = setInterval(async () => {
      if (document.visibilityState !== 'visible') return
      const { data } = await supabase.from('profiles').select('last_seen_at').eq('id', profileId).maybeSingle()
      if (active && data) setProfile((p) => (p ? { ...p, last_seen_at: data.last_seen_at } : p))
    }, 60_000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [profileId])

  // Viewing your own profile: send to the editable own-profile page.
  if (user && profile && profile.id === user.id) return <Navigate to="/profile" replace />

  if (loading) {
    return (
      <div className="container container-narrow">
        <Link to="/" className="muted" style={{ fontSize: 14 }}>← Back to browse</Link>
        <div className="spacer" />
        <ProfileSkeleton />
      </div>
    )
  }

  const name = profile?.nickname || profile?.display_name || 'player'

  return (
    <div className="container container-narrow">
      <Link to="/" className="muted" style={{ fontSize: 14 }}>← Back to browse</Link>
      <div className="spacer" />
      {profile ? (
        <>
          <ProfileView
            profile={profile}
            history={history}
            headerAction={
              <Link to={`/messages/${profile.id}`} className="btn btn-secondary btn-sm">💬 Message {name}</Link>
            }
          />
        </>
      ) : (
        <div className="alert alert-error">Player not found.</div>
      )}
    </div>
  )
}
