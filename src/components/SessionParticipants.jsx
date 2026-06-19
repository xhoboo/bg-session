import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Avatar from './Avatar'

// Shown to confirmed participants (host + approved guests) of a session. Lists
// everyone coming, together with the private "additional info" — real name,
// gender and in-person photo — to help people recognize each other in person.
// That private data is returned only for confirmed co-participants by
// profile_private's RLS, so there's nothing to hide on the client here.
export default function SessionParticipants({ sessionId, hostId }) {
  const { user } = useAuth()
  const [people, setPeople] = useState([])

  useEffect(() => {
    let active = true
    ;(async () => {
      const [hostRes, guestsRes] = await Promise.all([
        supabase.from('profiles').select('id, nickname, display_name, avatar_url').eq('id', hostId).maybeSingle(),
        supabase
          .from('join_requests')
          .select('guest:profiles(id, nickname, display_name, avatar_url)')
          .eq('session_id', sessionId)
          .eq('status', 'approved'),
      ])

      const list = []
      if (hostRes.data) list.push({ ...hostRes.data, isHost: true })
      ;(guestsRes.data ?? []).forEach((r) => r.guest && list.push({ ...r.guest, isHost: false }))

      const ids = list.map((p) => p.id)
      if (ids.length) {
        const { data: priv } = await supabase
          .from('profile_private')
          .select('id, real_name, gender, photo_url')
          .in('id', ids)
        const byId = new Map((priv ?? []).map((p) => [p.id, p]))
        list.forEach((p) => Object.assign(p, byId.get(p.id) ?? {}))
      }

      if (active) setPeople(list)
    })()
    return () => {
      active = false
    }
  }, [sessionId, hostId])

  if (people.length === 0) return null

  return (
    <>
      <h2 className="section-title">Who's coming ({people.length})</h2>
      <p className="muted" style={{ marginTop: -4, fontSize: 13 }}>
        Extra details below are shared only between confirmed participants so you can recognize each other.
      </p>
      <div className="participants-list">
        {people.map((p) => {
          const name = p.nickname || p.display_name || 'Player'
          const extras = [p.real_name, p.gender].filter(Boolean)
          return (
            <div className="participant-card card" key={p.id}>
              <Avatar name={name} src={p.photo_url || p.avatar_url} size={52} />
              <div style={{ minWidth: 0 }}>
                <Link to={`/users/${p.id}`} className="user-link">
                  {name}
                  {p.isHost && <span className="badge badge-area">Host</span>}
                  {p.id === user.id && <span className="muted" style={{ fontWeight: 400 }}>· you</span>}
                </Link>
                {extras.length > 0 && (
                  <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{extras.join(' · ')}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
