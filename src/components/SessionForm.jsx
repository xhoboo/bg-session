import { useState } from 'react'
import { JAKARTA_AREAS } from '../data/areas'
import GameTagInput from './GameTagInput'

// Presentational form shared by Create and Edit. It owns the field state
// (seeded from `initial`) and hands the raw values back via onSubmit — the
// parent decides how to persist them.
export default function SessionForm({ initial, submitLabel, busy, onSubmit }) {
  const [form, setForm] = useState(initial)
  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(form)
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="field-label" htmlFor="title">Session title</label>
        <input
          id="title"
          type="text"
          maxLength={140}
          placeholder="e.g. Sunday Heavy Euro Night"
          value={form.title}
          onChange={update('title')}
          required
        />
      </div>

      <div className="form-group">
        <label className="field-label" htmlFor="startsAt">Date & time</label>
        <input
          id="startsAt"
          type="datetime-local"
          value={form.startsAt}
          onChange={update('startsAt')}
          required
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="field-label" htmlFor="area">Neighborhood area</label>
          <select id="area" value={form.area} onChange={update('area')} required>
            <option value="" disabled>Choose area…</option>
            {JAKARTA_AREAS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="field-label" htmlFor="maxPlayers">Max players <span className="field-hint">(incl. host)</span></label>
          <input
            id="maxPlayers"
            type="number"
            min={1}
            max={50}
            value={form.maxPlayers}
            onChange={update('maxPlayers')}
            required
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="field-label" htmlFor="minPlayers">
            Min players <span className="field-hint">— or it's canceled</span>
          </label>
          <input
            id="minPlayers"
            type="number"
            min={1}
            max={50}
            value={form.minPlayers}
            onChange={update('minPlayers')}
            required
          />
          <div className="field-hint" style={{ marginTop: 6 }}>
            If fewer than this confirm by the start time, the session is automatically canceled and removed.
          </div>
        </div>

        <div className="form-group">
          <label className="field-label" htmlFor="duration">Estimated duration</label>
          <select id="duration" value={form.durationMinutes} onChange={update('durationMinutes')}>
            <option value="">Not sure</option>
            <option value="60">~1 hour</option>
            <option value="120">~2 hours</option>
            <option value="180">~3 hours</option>
            <option value="240">~4 hours</option>
            <option value="300">~5 hours</option>
            <option value="360">6+ hours</option>
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="field-label" htmlFor="address">
          Full address <span className="field-hint">— private, shown only to confirmed guests</span>
        </label>
        <textarea
          id="address"
          placeholder="Street, building, unit number, landmarks…"
          value={form.fullAddress}
          onChange={update('fullAddress')}
          required
        />
      </div>

      <div className="form-group">
        <label className="field-label" htmlFor="mapsUrl">
          Google Maps link <span className="field-hint">— optional, pin the exact spot so guests can navigate</span>
        </label>
        <input
          id="mapsUrl"
          type="url"
          placeholder="https://maps.app.goo.gl/…"
          value={form.mapsUrl}
          onChange={update('mapsUrl')}
        />
      </div>

      <GameTagInput
        label="Board games"
        hint="what you plan to bring/play — type to search the catalog"
        items={(form.boardGames || '').split(',').map((s) => s.trim()).filter(Boolean)}
        onChange={(games) => setForm((f) => ({ ...f, boardGames: games.join(', ') }))}
        max={20}
      />

      <div className="form-group">
        <label className="field-label" htmlFor="type">Joining</label>
        <select id="type" value={form.sessionType} onChange={update('sessionType')}>
          <option value="approval">Approval required — you review each request</option>
          <option value="open">Open — guests are confirmed instantly</option>
        </select>
      </div>

      <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
        {busy ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}
