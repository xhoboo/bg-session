import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

// Loads the board_games catalog once and returns a case-insensitive lookup:
// a Map of lowercased name -> canonical name as stored in the catalog. Chips
// use this to decide whether a game is clickable (in the catalog) and to show
// the catalog's canonical spelling (e.g. "unstable unicorns" -> "Unstable
// Unicorns" once it's been added). `loading` lets callers avoid flashing a
// "not in catalog" state before the lookup is ready.
export function useGameCatalog() {
  const [catalog, setCatalog] = useState(() => new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await supabase.from('board_games').select('name')
      if (!active) return
      setCatalog(new Map((data ?? []).map((g) => [g.name.toLowerCase(), g.name])))
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [])

  return { catalog, loading }
}
