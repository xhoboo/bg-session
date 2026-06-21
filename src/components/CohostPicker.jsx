import Avatar from './Avatar'

// Co-host picker for a weekly session. Co-hosts can only be appointed from people
// who already confirmed-joined, so this is a toggle list over `candidates` (the
// occurrence's confirmed participants) rather than a free search over all
// profiles. `value` is the chosen subset as an array of { id, nickname,
// display_name, avatar_url }; `onChange` receives the new array. `excludeId` (the
// host) is filtered out defensively — the host is never among the guests anyway.
export default function CohostPicker({ value = [], onChange, candidates = [], excludeId }) {
  const selectedIds = new Set(value.map((v) => v.id))
  const list = candidates.filter((m) => m.id !== excludeId)

  const toggle = (m) => {
    if (selectedIds.has(m.id)) onChange(value.filter((v) => v.id !== m.id))
    else onChange([...value, m])
  }

  if (list.length === 0) {
    return (
      <p className="search-hint" style={{ marginTop: 0 }}>
        Co-hosts are chosen from confirmed participants — once players join, you can appoint them here.
      </p>
    )
  }

  return (
    <div className="cohost-results">
      {list.map((m) => {
        const nm = m.nickname || m.display_name || 'Player'
        const on = selectedIds.has(m.id)
        return (
          <button
            type="button"
            key={m.id}
            className={'search-result cohost-option' + (on ? ' is-on' : '')}
            aria-pressed={on}
            onClick={() => toggle(m)}
          >
            <Avatar name={nm} src={m.avatar_url} size={30} />
            <span className="search-result-name">{nm}</span>
            <span className="cohost-option-check" aria-hidden="true">{on ? '✓' : ''}</span>
          </button>
        )
      })}
    </div>
  )
}
