import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

// Loads the board_games catalog and returns a case-insensitive lookup: a Map of
// lowercased name -> canonical name as stored in the catalog. Chips use this to
// decide whether a game is clickable (in the catalog) and to show the catalog's
// canonical spelling (e.g. "unstable unicorns" -> "Unstable Unicorns" once it's
// been added). `loading` lets callers avoid flashing a "not in catalog" state
// before the lookup is ready.
//
// The catalog is small, read-only reference data, so the first successful load
// is cached at module scope and reused by every component that mounts this hook
// — navigating between sessions/profiles no longer refetches it. A full page
// reload (or, for admins, after adding a game) picks up any changes.
let cache = null // Map<lowercased name, canonical name>

export function useGameCatalog() {
  const [catalog, setCatalog] = useState(() => cache ?? new Map())
  const [loading, setLoading] = useState(cache === null)

  useEffect(() => {
    if (cache) return // already loaded — serve from cache
    let active = true
    ;(async () => {
      const { data, error } = await supabase.from('board_games').select('name')
      if (!active) return
      const map = new Map((data ?? []).map((g) => [g.name.toLowerCase(), g.name]))
      if (!error) cache = map // cache only successful loads, so an error retries next mount
      setCatalog(map)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [])

  return { catalog, loading }
}
