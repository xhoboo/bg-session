import { useState } from 'react'
import GameListInput from './GameListInput'

const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say']

// Build the form state shape from a profile row (or empty for a new user).
export function profileToForm(p) {
  return {
    realName: p?.real_name || '',
    nickname: p?.nickname || p?.display_name || '',
    gender: p?.gender || '',
    favoriteGames: p?.favorite_games?.length ? p.favorite_games : [''],
    ownedGames: p?.owned_games?.length ? p.owned_games : [''],
  }
}

// Shared by the Onboarding and Profile pages. Collects the values and hands
// cleaned data (trimmed, empty rows dropped) to the parent via onSubmit.
export default function ProfileForm({ initial, submitLabel, busy, onSubmit }) {
  const [form, setForm] = useState(initial)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const setGames = (key) => (arr) => setForm((f) => ({ ...f, [key]: arr }))

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({
      realName: form.realName.trim(),
      nickname: form.nickname.trim(),
      gender: form.gender,
      favoriteGames: form.favoriteGames.map((s) => s.trim()).filter(Boolean),
      ownedGames: form.ownedGames.map((s) => s.trim()).filter(Boolean),
    })
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="field-label" htmlFor="realName">Real name</label>
        <input id="realName" type="text" value={form.realName} onChange={set('realName')} placeholder="e.g. Andi Wijaya" />
      </div>

      <div className="form-group">
        <label className="field-label" htmlFor="nickname">
          Nickname <span className="field-hint">— shown to other players</span>
        </label>
        <input id="nickname" type="text" value={form.nickname} onChange={set('nickname')} placeholder="e.g. Andi" required />
      </div>

      <div className="form-group">
        <label className="field-label" htmlFor="gender">Gender</label>
        <select id="gender" value={form.gender} onChange={set('gender')}>
          <option value="">Prefer not to say</option>
          {GENDERS.filter((g) => g !== 'Prefer not to say').map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>

      <GameListInput
        label="Favorite board games"
        hint="at least 1, up to 10"
        items={form.favoriteGames}
        onChange={setGames('favoriteGames')}
        max={10}
        placeholder="e.g. Brass Birmingham"
      />

      <GameListInput
        label="Board games you own"
        hint="optional — it's fine to own none"
        items={form.ownedGames}
        onChange={setGames('ownedGames')}
        max={30}
        placeholder="e.g. Wingspan"
      />

      <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
        {busy ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}
