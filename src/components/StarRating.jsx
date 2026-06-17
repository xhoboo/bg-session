import { useState } from 'react'

// 1–10 star rating. Interactive when onChange is provided; read-only otherwise.
export default function StarRating({ value = 0, onChange, size = 24, showvalue = true }) {
  const [hover, setHover] = useState(0)
  const readOnly = !onChange
  const active = hover || value

  return (
    <span className="stars" style={{ fontSize: size }}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          className={'star-btn' + (readOnly ? ' readonly' : '')}
          disabled={readOnly}
          aria-label={`${n} of 10`}
          onMouseEnter={() => !readOnly && setHover(n)}
          onMouseLeave={() => !readOnly && setHover(0)}
          onClick={() => onChange && onChange(n)}
        >
          <span className={active >= n ? 'star on' : 'star'}>★</span>
        </button>
      ))}
      {showvalue && value > 0 && <span className="muted" style={{ fontSize: 13, marginLeft: 6 }}>{value}/10</span>}
    </span>
  )
}
