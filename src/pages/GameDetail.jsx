import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Avatar from '../components/Avatar'
import { bggLink } from '../lib/format'

// Detail page for a board game (by name): its category (if it's in the catalog)
// plus the members who favorite it and who own it.
export default function GameDetail() {
  const { name } = useParams()
  const gameName = decodeURIComponent(name || '')
  const [game, setGame] = useState(null)
  const [favoritedBy, setFavoritedBy] = useState([])
  const [ownedBy, setOwnedBy] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([
      supabase.from('board_games').select('name, category, bgg_url').eq('name', gameName).maybeSingle(),
      supabase.from('profiles').select('id, nickname, display_name, avatar_url').contains('favorite_games', [gameName]),
      supabase.from('profiles').select('id, nickname, display_name, avatar_url').contains('owned_games', [gameName]),
    ]).then(([g, fav, own]) => {
      if (!active) return
      setGame(g.data ?? null)
      setFavoritedBy(fav.data ?? [])
      setOwnedBy(own.data ?? [])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [gameName])

  if (loading) return <div className="spinner" aria-label="Loading" />

  return (
    <div className="container container-narrow">
      <Link to="/" className="muted" style={{ fontSize: 14 }}>← Back to browse</Link>
      <div style={{ marginTop: 12, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>🎲 {gameName}</h1>
        <a
          className="btn btn-secondary btn-sm"
          href={bggLink(gameName, game?.bgg_url)}
          target="_blank"
          rel="noopener noreferrer"
        >
          🔗 View on BoardGameGeek ↗
        </a>
      </div>
      <p className="subtitle">
        {game ? (game.category === 'expansion' ? 'Expansion' : 'Base game') : 'Not in the catalog yet'}
      </p>

      <h2 className="section-title">Favorited by ({favoritedBy.length})</h2>
      <MemberGrid members={favoritedBy} emptyText="No one has favorited this yet." />

      <h2 className="section-title">Owned by ({ownedBy.length})</h2>
      <MemberGrid members={ownedBy} emptyText="No one has registered owning this yet." />
    </div>
  )
}

function MemberGrid({ members, emptyText }) {
  if (members.length === 0) return <p className="muted">{emptyText}</p>
  return (
    <div className="member-grid">
      {members.map((m) => {
        const nm = m.nickname || m.display_name || 'Player'
        return (
          <Link to={`/users/${m.id}`} key={m.id} className="member-card">
            <Avatar name={nm} src={m.avatar_url} size={32} />
            <span className="member-name">{nm}</span>
          </Link>
        )
      })}
    </div>
  )
}
