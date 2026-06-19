import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

// Loads the region/area catalog from Supabase once. Returns the ordered list of
// region names and a lookup of area names keyed by region name. Regions/areas
// added later via the local admin tool show up here without a code change, so
// the Host-a-Session form and the Browse filters always read the live catalog.
export function useRegions() {
  const [regions, setRegions] = useState([])
  const [areasByRegion, setAreasByRegion] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      const [regRes, areaRes] = await Promise.all([
        supabase.from('regions').select('id, name').order('sort_order').order('name'),
        supabase.from('areas').select('name, region_id, sort_order').order('sort_order').order('name'),
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

      setRegions(regs.map((r) => r.name))
      setAreasByRegion(byRegion)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [])

  return { regions, areasByRegion, loading }
}
