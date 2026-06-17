// A dynamic list of text inputs for entering board game names (favorites / owned).
// Always renders at least one row; enforces a max via the disabled Add button.
export default function GameListInput({ label, hint, items, onChange, max, placeholder }) {
  const list = items.length ? items : ['']

  const update = (i, val) => {
    const next = [...list]
    next[i] = val
    onChange(next)
  }
  const add = () => {
    if (list.length < max) onChange([...list, ''])
  }
  const remove = (i) => {
    const next = list.filter((_, idx) => idx !== i)
    onChange(next.length ? next : [''])
  }

  return (
    <div className="form-group">
      <label className="field-label">
        {label} {hint && <span className="field-hint">— {hint}</span>}
      </label>
      <div className="stack">
        {list.map((g, i) => (
          <div className="game-row" key={i}>
            <input
              type="text"
              value={g}
              placeholder={placeholder || 'e.g. Catan'}
              onChange={(e) => update(i, e.target.value)}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => remove(i)}
              aria-label="Remove game"
              disabled={list.length === 1 && !list[0]}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={add}
        disabled={list.length >= max}
        style={{ marginTop: 8 }}
      >
        + Add game
      </button>
    </div>
  )
}
