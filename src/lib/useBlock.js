import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from '../context/AuthContext'

// Tracks whether the current user has blocked `targetId`, and exposes block /
// unblock actions. RLS only lets a user read their OWN block rows, so this can
// answer "did I block them?" but never "did they block me?" — the latter only
// surfaces as a failed send (the DB trigger from migration 0037 rejects it).
export function useBlock(targetId) {
  const { user } = useAuth()
  const [blocked, setBlocked] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!targetId || targetId === user.id) return
    let active = true
    supabase
      .from('user_blocks')
      .select('blocked_id')
      .eq('blocker_id', user.id)
      .eq('blocked_id', targetId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setBlocked(!!data)
      })
    return () => {
      active = false
    }
  }, [user.id, targetId])

  const block = useCallback(async () => {
    setBusy(true)
    const { error } = await supabase.from('user_blocks').insert({ blocker_id: user.id, blocked_id: targetId })
    setBusy(false)
    if (!error) setBlocked(true)
    return !error
  }, [user.id, targetId])

  const unblock = useCallback(async () => {
    setBusy(true)
    const { error } = await supabase.from('user_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', targetId)
    setBusy(false)
    if (!error) setBlocked(false)
    return !error
  }, [user.id, targetId])

  return { blocked, busy, block, unblock }
}
