import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

// Loads the region/area catalog from Supabase. Returns the ordered list of
// region names and a lookup of area names keyed by region name. Regions/areas
// added later via the local admin tool show up after a page reload, so the
// Host-a-Session form and the Browse filters stay in sync with the catalog.
//
// Like the board-game catalog this is small, read-only reference data, so the
// first successful load is cached at module scope and shared across every
// component that mounts this hook (no refetch when navigating between Browse and
// the Host form). A full reload picks up any newly added regions/areas.
let cache = null // { regions: string[], areasByRegion: Record<string, string[]> }

export function useRegions() {
  const [data, setData] = useState(() => cache ?? { regions: [], areasByRegion: {} })
  const [loading, setLoading] = useState(cache === null)

  useEffect(() => {
    if (cache) return // already loaded — serve from cache
    let active = true
    ;(async () => {
      const [regRes, areaRes] = await Promise.all([
        supabase.from('regions').select('id, name').order('name'),
        supabase.from('areas').select('name, region_id').order('name'),
      ])
      if (!active) return

      const regs = regRes.data ?? []
      const idToName = new Map(regs.map((r) => [r.id, r.name]))
      const byRegion = {}
      for (const a of areaRes.data ?? []) {
        const rname = idToName.get(a.region_id)
        if (!rname) continue
        ;(byRegion[rname] ||= []).push(a.name)
      }

      // Present regions and areas alphabetically in the dropdowns. (Sorted
      // client-side too so it's independent of the query order / collation.)
      const byName = (a, b) => a.localeCompare(b)
      for (const k of Object.keys(byRegion)) byRegion[k].sort(byName)
      const next = { regions: regs.map((r) => r.name).sort(byName), areasByRegion: byRegion }
      if (!regRes.error && !areaRes.error) cache = next // cache only successful loads
      setData(next)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [])

  return { regions: data.regions, areasByRegion: data.areasByRegion, loading }
}
