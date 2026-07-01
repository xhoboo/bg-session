import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import Skeleton from '../components/Skeleton'
import { bggLink } from '../lib/format'
import { userPath, personName } from '../lib/nickname'

// Detail page for a board game (by name): its category (if it's in the catalog)
// plus the members who favorite it and who own it.
export default function GameDetail() {
  const { name } = useParams()
  const { user } = useAuth()
  const gameName = decodeURIComponent(name || '')
  const [game, setGame] = useState(null)
  const [favoritedBy, setFavoritedBy] = useState([])
  const [ownedBy, setOwnedBy] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    const gamePromise = supabase.from('board_games').select('name, category, bgg_url').eq('name', gameName).maybeSingle()

    // Signed-in users read `profiles` directly (member chips link to profiles).
    // Guests can't, so the public display fields come from the get_game_members
    // SECURITY DEFINER RPC and the chips render non-clickable.
    if (user) {
      Promise.all([
        gamePromise,
        supabase.from('profiles').select('id, nickname, display_name, avatar_url').contains('favorite_games', [gameName]),
        supabase.from('profiles').select('id, nickname, display_name, avatar_url').contains('owned_games', [gameName]),
      ]).then(([g, fav, own]) => {
        if (!active) return
        setGame(g.data ?? null)
        setFavoritedBy(fav.data ?? [])
        setOwnedBy(own.data ?? [])
        setLoading(false)
      })
    } else {
      Promise.all([gamePromise, supabase.rpc('get_game_members', { p_game: gameName })]).then(([g, mem]) => {
        if (!active) return
        const rows = mem.data ?? []
        setGame(g.data ?? null)
        setFavoritedBy(rows.filter((r) => r.is_favorite))
        setOwnedBy(rows.filter((r) => r.is_owned))
        setLoading(false)
      })
    }
    return () => {
      active = false
    }
  }, [gameName, user])

  if (loading) {
    return (
      <div className="container container-narrow" role="status" aria-label="Loading game">
        <Skeleton width="60%" height={25} style={{ marginTop: 14 }} />
        <Skeleton width={180} height={34} radius={10} style={{ marginTop: 14 }} />
        <Skeleton width="45%" height={17} style={{ marginTop: 26 }} />
        <div className="member-grid" style={{ marginTop: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} width={130} height={42} radius={999} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="container container-narrow">
      {/* Name + type label. overflowWrap/wordBreak let very long names wrap
          instead of pushing the page wider than the screen (e.g. iPhone SE). */}
      <h1 style={{ marginTop: 12, marginBottom: 4, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
        <svg aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-0.12em', flex: 'none' }}>
          <path d="M12 2L22 7L12 12L2 7Z" />
          <path d="M22 7L22 17L12 22L12 12Z" />
          <path d="M2 7L12 12L12 22L2 17Z" />
          <circle cx="12" cy="7" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="19" cy="12" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="15" cy="18" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="5" cy="11" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="7" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="9" cy="18" r="1.1" fill="currentColor" stroke="none" />
        </svg>{' '}
        {gameName}{' '}
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--slate-600)', whiteSpace: 'nowrap' }}>
          · {game ? (game.category === 'expansion' ? 'Expansion' : 'Base game') : 'Not in the catalog yet'}
        </span>
      </h1>
      <div style={{ marginTop: 10, marginBottom: 22 }}>
        <a
          className="btn btn-secondary btn-sm"
          href={bggLink(gameName, game?.bgg_url)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-0.12em' }}>
            <circle cx="18" cy="5" r="2.5" />
            <circle cx="6" cy="12" r="2.5" />
            <circle cx="18" cy="19" r="2.5" />
            <path d="M8.4 10.9l7.2-4.2" />
            <path d="M8.4 13.1l7.2 4.2" />
          </svg>{' '}
          View on BoardGameGeek ↗
        </a>
      </div>

      <h2 className="section-title">Favorited by ({favoritedBy.length})</h2>
      <MemberGrid members={favoritedBy} emptyText="No one has favorited this yet." clickable={!!user} />

      <h2 className="section-title">Owned by ({ownedBy.length})</h2>
      <MemberGrid members={ownedBy} emptyText="No one has registered owning this yet." clickable={!!user} />
    </div>
  )
}

// `clickable` chips link to the member's profile (signed-in users); for guests
// the same chips render as plain, non-clickable cards so profiles stay private.
function MemberGrid({ members, emptyText, clickable }) {
  if (members.length === 0) return <p className="muted">{emptyText}</p>
  return (
    <div className="member-grid">
      {members.map((m) => {
        const nm = personName(m) || 'Player'
        const inner = (
          <>
            <Avatar name={nm} src={m.avatar_url} size={32} />
            <span className="member-name">{nm}</span>
          </>
        )
        return clickable ? (
          <Link to={userPath(m.nickname || m.id)} key={m.id} className="member-card">{inner}</Link>
        ) : (
          <div key={m.id} className="member-card">{inner}</div>
        )
      })}
    </div>
  )
}
