import Avatar from './Avatar'

// Co-host picker for a weekly session. Current co-hosts show as removable chips
// (so the host can step any of them down at any time), and confirmed
// participants who aren't already co-hosts are listed below to appoint. `value`
// is the chosen subset as an array of { id, nickname, display_name, avatar_url };
// `onChange` receives the new array. `excludeId` (the host) is filtered out
// defensively — the host is never among the guests anyway.
export default function CohostPicker({ value = [], onChange, candidates = [], excludeId }) {
  const selectedIds = new Set(value.map((v) => v.id))
  const nameOf = (m) => m.nickname || m.display_name || 'Player'

  const remove = (id) => onChange(value.filter((v) => v.id !== id))
  const add = (m) => onChange([...value, m])

  // People who could still be appointed: confirmed participants, minus the host,
  // minus anyone already a co-host.
  const addable = candidates.filter((m) => m.id !== excludeId && !selectedIds.has(m.id))

  return (
    <>
      {value.length > 0 && (
        <div className="cohost-chips">
          {value.map((m) => {
            const nm = nameOf(m)
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

      {addable.length > 0 && (
        <div className="cohost-results">
          {addable.map((m) => {
            const nm = nameOf(m)
            return (
              <button
                type="button"
                key={m.id}
                className="search-result cohost-option"
                onClick={() => add(m)}
              >
                <Avatar name={nm} src={m.avatar_url} size={30} />
                <span className="search-result-name">{nm}</span>
                <span className="cohost-option-check" aria-hidden="true">+</span>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
