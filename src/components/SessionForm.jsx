import { useState } from 'react'
import { useRegions } from '../lib/useRegions'
import GameTagInput from './GameTagInput'

// Presentational form shared by Create and Edit. It owns the field state
// (seeded from `initial`) and hands the raw values back via onSubmit — the
// parent decides how to persist them.
export default function SessionForm({ initial, submitLabel, busy, onSubmit }) {
  const [form, setForm] = useState(initial)
  const { regions, areasByRegion, loading: locLoading } = useRegions()
  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  // Picking a new region clears the area — its options depend on the region.
  const setRegion = (e) => setForm((f) => ({ ...f, region: e.target.value, area: '' }))

  // Keep an out-of-catalog current value selectable (e.g. an older session's
  // region/area) so editing an existing session never silently drops it.
  const regionList = form.region && !regions.includes(form.region) ? [form.region, ...regions] : regions
  const areaOptions = form.region ? areasByRegion[form.region] || [] : []
  const areaList = form.area && !areaOptions.includes(form.area) ? [form.area, ...areaOptions] : areaOptions
  // Some regions have no sub-areas yet — then the area field is optional.
  const hasAreas = areaOptions.length > 0

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(form)
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <div className="form-section">
        <div className="form-section-title">Session details</div>

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
      </div>

      <div className="form-section">
        <div className="form-section-title">Location</div>

        <div className="form-row">
          <div className="form-group">
            <label className="field-label" htmlFor="region">Region</label>
            <select id="region" value={form.region} onChange={setRegion} required>
              <option value="" disabled>{locLoading ? 'Loading…' : 'Choose region…'}</option>
              {regionList.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="field-label" htmlFor="area">Area</label>
            <select id="area" value={form.area} onChange={update('area')} required={hasAreas} disabled={!form.region}>
              <option value="" disabled={hasAreas}>
                {!form.region ? 'Pick a region first' : hasAreas ? 'Choose area…' : 'No areas — optional'}
              </option>
              {areaList.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
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
      </div>

      <div className="form-section">
        <div className="form-section-title">Players & duration</div>

        <div className="form-row">
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

          <div className="form-group">
            <label className="field-label" htmlFor="minPlayers">
              Min players <span className="field-hint">— or it's canceled</span>
            </label>
            <input
              id="minPlayers"
              type="number"
              min={3}
              max={50}
              value={form.minPlayers}
              onChange={update('minPlayers')}
              required
            />
          </div>
        </div>
        <div className="field-hint">
          At least 3. If fewer than the minimum confirm by the start time, the session is automatically canceled and removed.
        </div>

        <div className="form-group" style={{ marginTop: 16 }}>
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

      <div className="form-section">
        <div className="form-section-title">Games & joining</div>

        <GameTagInput
          label="Board games"
          hint="what you plan to bring/play — add at least one"
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
      </div>

      <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
        {busy ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}
