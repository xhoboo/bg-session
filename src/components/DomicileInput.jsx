import { useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useDebouncedCallback } from '../lib/useDebouncedCallback'

// Strict picker: the committed value must be chosen from the domiciles list.
// Typing filters suggestions but does not commit a freeform value.
export default function DomicileInput({ value, onChange }) {
  const [query, setQuery] = useState(value || '')
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const latest = useRef('') // the most recent term we want results for

  // Debounced lookup; drop replies that no longer match the latest term.
  const fetchSuggestions = useDebouncedCallback(async (q) => {
    const { data } = await supabase
      .from('domiciles')
      .select('name')
      .ilike('name', `%${q}%`)
      .order('name')
      .limit(8)
    if (q !== latest.current) return
    setSuggestions(data ?? [])
    setOpen(true)
  })

  const search = (q) => {
    setQuery(q)
    onChange('') // not committed until a suggestion is picked
    const term = q.trim()
    latest.current = term
    if (!term) {
      setSuggestions([])
      setOpen(false)
      return
    }
    fetchSuggestions(term)
  }

  const pick = (name) => {
    setQuery(name)
    onChange(name)
    latest.current = '' // discard any in-flight suggestion request
    setSuggestions([])
    setOpen(false)
  }

  return (
    <div className="form-group">
      <label className="field-label" htmlFor="domicile">
        Domicile <span className="field-hint">— pick your city/area from the list</span>
      </label>
      <div className="autocomplete">
        <input
          id="domicile"
          type="text"
          value={query}
          placeholder="Type to search…"
          autoComplete="off"
          onChange={(e) => search(e.target.value)}
          onFocus={() => query && !value && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
        />
        {open && suggestions.length > 0 && (
          <div className="autocomplete-menu">
            {suggestions.map((s) => (
              <button
                key={s.name}
                type="button"
                className="autocomplete-item"
                onMouseDown={(e) => { e.preventDefault(); pick(s.name) }}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {query && !value && (
        <p className="field-hint" style={{ marginTop: 6, color: 'var(--amber-600)' }}>
          Pick an option from the list to set your domicile.
        </p>
      )}
    </div>
  )
}
