import { useState } from 'react'

// One collapsible section in a finished session's history group (Reviews, Game
// Scores, Participants, Session Chat). The sections sit in a single connected
// `.section-group` container, divided by hairlines; each header toggles its own
// body. Collapsed by default — pass `defaultOpen` to start expanded (e.g. the
// Reviews section when the page is opened at #review). `flush` drops the body's
// inner padding so an edge-to-edge list (participants, score cards) can fill it.
export default function AccordionSection({ title, count, defaultOpen = false, flush = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={'section-acc' + (open ? ' is-open' : '')}>
      <button type="button" className="section-acc-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="section-acc-title">
          {title}
          {count != null && <span className="section-acc-count">{count}</span>}
        </span>
        <span className="section-acc-chevron" aria-hidden="true">▾</span>
      </button>
      {open && <div className={'section-acc-body' + (flush ? ' is-flush' : '')}>{children}</div>}
    </section>
  )
}
