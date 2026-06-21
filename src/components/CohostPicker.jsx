import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useDebouncedCallback } from '../lib/useDebouncedCallback'
import Avatar from './Avatar'

// Member picker for choosing a weekly session's co-hosts. Searches profiles by
// nickname / display name (same approach as GlobalSearch) and shows the chosen
// people as removable chips. `value` is an array of { id, nickname,
// display_name, avatar_url }; `onChange` receives the new array.
export default function CohostPicker({ value = [], onChange, excludeId }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  const run = useDebouncedCallback(async (q) => {
    // The .or() filter is a PostgREST comma string — strip commas/parens.
    const safe = q.replace(/[,()]/g, ' ').trim()
    if (!safe) {
      setResults([])
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('profiles')
      .select('id, nickname, display_name, avatar_url')
      .or(`nickname.ilike.%${safe}%,display_name.ilike.%${safe}%`)
      .limit(6)
    setResults(data ?? [])
    setLoading(false)
  })

  const onInput = (val) => {
    setQuery(val)
    if (!val.trim()) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    run(val)
  }

  const selectedIds = new Set(value.map((v) => v.id))
  const add = (m) => {
    if (selectedIds.has(m.id)) return
    onChange([...value, m])
    setQuery('')
    setResults([])
  }
  const remove = (id) => onChange(value.filter((v) => v.id !== id))

  const candidates = results.filter((m) => m.id !== excludeId && !selectedIds.has(m.id))
  const term = query.trim()

  return (
    <div>
      {value.length > 0 && (
        <div className="cohost-chips">
          {value.map((m) => {
            const nm = m.nickname || m.display_name || 'Player'
            return (
              <span className="cohost-chip" key={m.id}>
                <Avatar name={nm} src={m.avatar_url} size={22} />
                {nm}
                <button type="button" aria-label={`Remove ${nm}`} onClick={() => remove(m.id)}>×</button>
              </span>
            )
          })}
        </div>
      )}

      <input
        type="text"
        placeholder="Search members by name…"
        value={query}
        autoComplete="off"
        onChange={(e) => onInput(e.target.value)}
      />

      {term && (
        <div className="cohost-results" style={{ marginTop: 8 }}>
          {loading ? (
            <p className="search-hint">Searching…</p>
          ) : candidates.length === 0 ? (
            <p className="search-hint">No members match “{term}”.</p>
          ) : (
            candidates.map((m) => {
              const nm = m.nickname || m.display_name || 'Player'
              return (
                <button type="button" key={m.id} className="search-result" onClick={() => add(m)}>
                  <Avatar name={nm} src={m.avatar_url} size={30} />
                  <span className="search-result-name">{nm}</span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
