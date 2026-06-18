import { useEffect, useRef } from 'react'

// Returns a stable function that defers calling `fn` until `delay` ms have
// passed without another call. Pending calls are cancelled on a new call and
// on unmount, so rapid typing only triggers one invocation (and never fires
// after the component is gone).
export function useDebouncedCallback(fn, delay = 200) {
  const timer = useRef(null)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => () => clearTimeout(timer.current), [])

  return (...args) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => fnRef.current(...args), delay)
  }
}
