import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useDebouncedCallback } from '../lib/useDebouncedCallback'
import { userPath } from '../lib/nickname'
import Avatar from './Avatar'

// Magnifier icon shared by the trigger button and the input.
const SearchIcon = ({ size = 22, className }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
)

// Header search: one box that finds both members (profiles, by nickname or
// display name) and board games (the catalog, by name). Results are grouped and
// link to the member's public profile or the game detail page. Lives in the top
// bar to the left of the notification bell.
export default function GlobalSearch() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [members, setMembers] = useState([])
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const latest = useRef('') // the most recent term we want results for

  // Debounced so we query once the user pauses, not per keystroke. Drop any
  // response that no longer matches the latest term (out-of-order replies).
  const runSearch = useDebouncedCallback(async (q) => {
    // The profiles `.or()` filter is a comma-separated PostgREST string, so a
    // comma or paren in the term would break its parsing — strip those out.
    const safe = q.replace(/[,()]/g, ' ').trim()
    const [memRes, gameRes] = await Promise.all([
      // Members are searchable only for signed-in users; guests get games only
      // (profiles stay closed to anon).
      user && safe
        ? supabase
            .from('profiles')
            .select('id, nickname, display_name, avatar_url')
            .or(`nickname.ilike.%${safe}%,display_name.ilike.%${safe}%`)
            .limit(5)
        : Promise.resolve({ data: [] }),
      supabase
        .from('board_games')
        .select('name, category')
        .ilike('name', `%${q}%`)
        .order('name')
        .limit(5),
    ])
    if (q !== latest.current) return
    setMembers(memRes.data ?? [])
    setGames(gameRes.data ?? [])
    setLoading(false)
  })

  const onChange = (val) => {
    setQuery(val)
    const term = val.trim()
    latest.current = term
    if (!term) {
      setMembers([])
      setGames([])
      setLoading(false)
      return
    }
    setLoading(true)
    runSearch(term)
  }

  const close = () => {
    setOpen(false)
    setQuery('')
    setMembers([])
    setGames([])
    latest.current = ''
  }

  const goMember = (m) => {
    close()
    // Flag the source so UserProfile knows not to show a back button.
    navigate(userPath(m.nickname || m.id), { state: { fromSearch: true } })
  }

  const goGame = (g) => {
    close()
    navigate(`/games/${encodeURIComponent(g.name)}`)
  }

  // Focus the input as soon as the panel opens.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Close the panel on outside click.
  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const term = query.trim()
  const hasResults = members.length > 0 || games.length > 0

  return (
    <div ref={wrapRef} className="search-wrap">
      <button
        className="bell"
        aria-label="Search members and games"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <SearchIcon />
      </button>

      {open && (
        <div className="search-panel">
          <div className="search-input-row">
            <SearchIcon size={18} className="search-input-icon" />
            <input
              ref={inputRef}
              type="text"
              className="search-input"
              placeholder={user ? 'Search members or games…' : 'Search board games…'}
              value={query}
              autoComplete="off"
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') close() }}
            />
          </div>

          <div className="search-results">
            {!term ? (
              <p className="search-hint">{user ? 'Type a name to find members or board games.' : 'Type to find board games.'}</p>
            ) : loading ? (
              <p className="search-hint">Searching…</p>
            ) : !hasResults ? (
              <p className="search-hint">No {user ? 'members or ' : ''}games match “{term}”.</p>
            ) : (
              <>
                {members.length > 0 && (
                  <>
                    <div className="search-group">Members</div>
                    {members.map((m) => {
                      const nm = m.nickname || m.display_name || 'Player'
                      return (
                        <button key={m.id} type="button" className="search-result" onClick={() => goMember(m)}>
                          <Avatar name={nm} src={m.avatar_url} size={30} />
                          <span className="search-result-name">{nm}</span>
                        </button>
                      )
                    })}
                  </>
                )}
                {games.length > 0 && (
                  <>
                    <div className="search-group">Board games</div>
                    {games.map((g) => (
                      <button key={g.name} type="button" className="search-result" onClick={() => goGame(g)}>
                        <span className="search-result-icon" aria-hidden="true">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
                            <path d="M12 2L22 7L12 12L2 7Z" />
                            <path d="M22 7L22 17L12 22L12 12Z" />
                            <path d="M2 7L12 12L12 22L2 17Z" />
                            <circle cx="12" cy="7" r="1.3" fill="currentColor" stroke="none" />
                            <circle cx="19" cy="12" r="1.1" fill="currentColor" stroke="none" />
                            <circle cx="15" cy="18" r="1.1" fill="currentColor" stroke="none" />
                            <circle cx="5" cy="11" r="1.1" fill="currentColor" stroke="none" />
                            <circle cx="7" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
                            <circle cx="9" cy="18" r="1.1" fill="currentColor" stroke="none" />
                          </svg>
                        </span>
                        <span className="search-result-name">{g.name}</span>
                        {g.category === 'expansion' && <span className="muted" style={{ fontSize: 12 }}>· Expansion</span>}
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
