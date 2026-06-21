import { useState } from 'react'
import { useRegions } from '../lib/useRegions'
import GameTagInput from './GameTagInput'
import CohostPicker from './CohostPicker'
import { WEEKDAYS, COHOST_FIELDS, nextWeeklyDate, formatDateTime } from '../lib/format'

// Shared form for creating / editing a weekly session. Mirrors SessionForm but
// the schedule is a weekday + time-of-day (it recurs), and it carries co-host
// management. Owns field state seeded from `initial`; hands raw values to
// onSubmit so the parent decides how to persist them.
//
//  - showCohostAdmin: render the co-host picker + permission checkboxes (host only).
//  - editableKeys: null = everything editable (host); otherwise an array of
//    permitted field keys — fields outside it are disabled (co-host editing).
export default function WeeklySessionForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
  showCohostAdmin = true,
  editableKeys = null,
  selfId,
}) {
  const [form, setForm] = useState(initial)
  const { regions, areasByRegion, loading: locLoading } = useRegions()
  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const setRegion = (e) => setForm((f) => ({ ...f, region: e.target.value, area: '' }))

  // Field-level permission gate for co-host editing (no-op for the host).
  const can = (key) => !editableKeys || editableKeys.includes(key)

  const regionList = form.region && !regions.includes(form.region) ? [form.region, ...regions] : regions
  const areaOptions = form.region ? areasByRegion[form.region] || [] : []
  const areaList = form.area && !areaOptions.includes(form.area) ? [form.area, ...areaOptions] : areaOptions
  const hasAreas = areaOptions.length > 0

  const preview = nextWeeklyDate(form.weeklyDay, form.startTime)
  const games = (form.boardGames || '').split(',').map((s) => s.trim()).filter(Boolean)

  const toggleEditable = (key) =>
    setForm((f) => {
      const set = new Set(f.cohostEditable || [])
      if (set.has(key)) set.delete(key)
      else set.add(key)
      return { ...f, cohostEditable: [...set] }
    })

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
            placeholder="e.g. Friday Night Boardgames"
            value={form.title}
            onChange={update('title')}
            disabled={!can('title')}
            required
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="field-label" htmlFor="weeklyDay">Every</label>
            <select id="weeklyDay" value={form.weeklyDay} onChange={update('weeklyDay')} disabled={!can('schedule')} required>
              <option value="" disabled>Choose day…</option>
              {WEEKDAYS.map((d, i) => (
                <option key={i} value={i}>{d}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="field-label" htmlFor="startTime">Start time</label>
            <input id="startTime" type="time" value={form.startTime} onChange={update('startTime')} disabled={!can('schedule')} required />
          </div>
        </div>

        {preview && (
          <p className="field-hint" style={{ marginTop: -4 }}>
            Next session: {formatDateTime(preview.toISOString())}
          </p>
        )}
      </div>

      <div className="form-section">
        <div className="form-section-title">Location</div>

        <div className="form-row">
          <div className="form-group">
            <label className="field-label" htmlFor="region">Region</label>
            <select id="region" value={form.region} onChange={setRegion} disabled={!can('location')} required>
              <option value="" disabled>{locLoading ? 'Loading…' : 'Choose region…'}</option>
              {regionList.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="field-label" htmlFor="area">Area</label>
            <select
              id="area"
              value={form.area}
              onChange={update('area')}
              required={can('location') && hasAreas}
              disabled={!can('location') || !form.region}
            >
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
            disabled={!can('location')}
            required
          />
        </div>

        <div className="form-group">
          <label className="field-label" htmlFor="mapsUrl">
            Google Maps link <span className="field-hint">— optional</span>
          </label>
          <input id="mapsUrl" type="url" placeholder="https://maps.app.goo.gl/…" value={form.mapsUrl} onChange={update('mapsUrl')} disabled={!can('location')} />
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">Players & duration</div>

        <div className="form-row">
          <div className="form-group">
            <label className="field-label" htmlFor="maxPlayers">Max players <span className="field-hint">(incl. host)</span></label>
            <input id="maxPlayers" type="number" min={1} max={50} value={form.maxPlayers} onChange={update('maxPlayers')} disabled={!can('players')} required />
          </div>
          <div className="form-group">
            <label className="field-label" htmlFor="minPlayers">Min players <span className="field-hint">— or it's canceled</span></label>
            <input id="minPlayers" type="number" min={3} max={50} value={form.minPlayers} onChange={update('minPlayers')} disabled={!can('players')} required />
          </div>
        </div>

        <div className="form-group" style={{ marginTop: 16 }}>
          <label className="field-label" htmlFor="duration">Estimated duration</label>
          <select id="duration" value={form.durationMinutes} onChange={update('durationMinutes')} disabled={!can('duration')}>
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

        {can('board_games') ? (
          <GameTagInput
            label="Board games"
            hint="this week's games — add at least one; they reset every week"
            items={games}
            onChange={(g) => setForm((f) => ({ ...f, boardGames: g.join(', ') }))}
            max={20}
          />
        ) : (
          <div className="form-group">
            <label className="field-label">Board games <span className="field-hint">— reset weekly</span></label>
            {games.length ? (
              <div className="chips">{games.map((g) => <span className="chip" key={g}>{g}</span>)}</div>
            ) : (
              <span className="muted">To be decided</span>
            )}
          </div>
        )}

        <div className="form-group">
          <label className="field-label" htmlFor="type">Joining</label>
          <select id="type" value={form.sessionType} onChange={update('sessionType')} disabled={!can('session_type')}>
            <option value="approval">Approval required — you review each request</option>
            <option value="open">Open — guests are confirmed instantly</option>
          </select>
        </div>
      </div>

      {showCohostAdmin && (
        <div className="form-section">
          <div className="form-section-title">Co-hosts</div>

          <div className="form-group">
            <label className="field-label">
              Co-hosts <span className="field-hint">— they keep their spot every week and can help run the session</span>
            </label>
            <CohostPicker
              value={form.cohosts || []}
              onChange={(c) => setForm((f) => ({ ...f, cohosts: c }))}
              excludeId={selfId}
            />
          </div>

          <div className="form-group">
            <label className="field-label">
              What can co-hosts edit? <span className="field-hint">— applies to all co-hosts</span>
            </label>
            <div className="check-grid">
              {COHOST_FIELDS.map((fld) => {
                const on = (form.cohostEditable || []).includes(fld.key)
                return (
                  <label className={'check-pill' + (on ? ' is-on' : '')} key={fld.key}>
                    <input type="checkbox" checked={on} onChange={() => toggleEditable(fld.key)} />
                    {fld.label}
                  </label>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <button className="btn btn-primary btn-block" type="submit" disabled={busy} style={{ marginTop: 18 }}>
        {busy ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}
