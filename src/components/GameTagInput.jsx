import { useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useDebouncedCallback } from '../lib/useDebouncedCallback'
import { ilikeWords, prefixFirst } from '../lib/search'

// Single autocomplete input for board game names. Suggestions come from the
// board_games catalog; you can pick a suggestion OR type a freeform name. Each
// added game appears as a chip above the input. Enter or "+ Add" commits.
export default function GameTagInput({ label, hint, items, onChange, max }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const latest = useRef('') // the most recent term we want results for
  const list = items || []
  const atMax = list.length >= max

  // Debounced so we hit the catalog once the user pauses, not per keystroke.
  // Drop any response that no longer matches the latest term (handles both
  // out-of-order replies and the user committing a game mid-request).
  // Matching is word-by-word in any order ("ticket europe" finds "Ticket to
  // Ride: Europe"), with names that start with the typed term ranked first.
  const fetchSuggestions = useDebouncedCallback(async (q) => {
    const { data } = await ilikeWords(
      supabase.from('board_games').select('name, category'),
      'name',
      q,
    )
      .order('name')
      .limit(8)
    if (q !== latest.current) return
    setSuggestions(prefixFirst(data ?? [], q))
    setOpen(true)
  })

  const search = (q) => {
    setQuery(q)
    const term = q.trim()
    latest.current = term
    if (!term) {
      setSuggestions([])
      setOpen(false)
      return
    }
    fetchSuggestions(term)
  }

  const addGame = (name) => {
    const n = name.trim()
    setQuery('')
    latest.current = '' // discard any in-flight suggestion request
    setSuggestions([])
    setOpen(false)
    if (!n || atMax) return
    if (list.some((g) => g.toLowerCase() === n.toLowerCase())) return
    onChange([...list, n])
  }

  const remove = (i) => onChange(list.filter((_, idx) => idx !== i))

  return (
    <div className="form-group">
      <label className="field-label">
        {label} {hint && <span className="field-hint">{label ? '— ' : ''}{hint}</span>}
      </label>

      {list.length > 0 && (
        <div className="chips" style={{ marginBottom: 10 }}>
          {list.map((g, i) => (
            <span className="chip chip-removable" key={g}>
              {g}
              <button type="button" className="chip-x" onClick={() => remove(i)} aria-label={`Remove ${g}`}>×</button>
            </span>
          ))}
        </div>
      )}

      <div className="autocomplete">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={query}
            placeholder={atMax ? 'Maximum reached' : 'Type a board game…'}
            autoComplete="off"
            disabled={atMax}
            onChange={(e) => search(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGame(query) } }}
            onFocus={() => query && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
          />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => addGame(query)} disabled={!query.trim() || atMax}>
            + Add
          </button>
        </div>
        {open && suggestions.length > 0 && (
          <div className="autocomplete-menu">
            {suggestions.map((s) => (
              <button
                key={s.name}
                type="button"
                className="autocomplete-item"
                onMouseDown={(e) => { e.preventDefault(); addGame(s.name) }}
              >
                {s.name}
                {s.category === 'expansion' && <span className="muted" style={{ fontSize: 12 }}> · Expansion</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
