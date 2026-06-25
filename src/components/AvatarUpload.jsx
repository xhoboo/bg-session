import { useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { resizeImage, extForType } from '../lib/resizeImage'
import { removeAvatarPaths } from '../lib/avatarStorage'
import Avatar from './Avatar'

// Uploads an image to the "avatars" storage bucket (under the user's folder) and
// reports the resulting public URL via onChange. The image is downscaled in the
// browser first (see resizeImage) so uploads stay small. Upload happens immediately
// on selection; the URL is persisted to the profile when the parent form is saved.
//
// To avoid orphaned files, a throwaway upload made earlier in *this* editing
// session is deleted as soon as it's replaced/removed. The file the field started
// with (the one already saved in the DB) is never touched here — replacing it
// safely would strand the DB's URL if the user cancels, so that cleanup is left to
// the parent's save handler (see cleanupReplacedAvatars), which only runs once the
// new URL is persisted.
export default function AvatarUpload({ value, name, onChange, label = 'Photo', hint, maxDim = 1024, quality = 0.82 }) {
  const { user } = useAuth()
  const inputRef = useRef(null)
  const sessionPath = useRef(null) // in-bucket path of this session's current upload, if any
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return
    setError('')
    if (!file.type.startsWith('image/')) return setError('Please choose an image file.')
    // We resize before upload, so we can accept larger originals (e.g. phone
    // photos) — but cap the raw input to avoid decoding huge files in the tab.
    if (file.size > 25 * 1024 * 1024) return setError('Image must be under 25 MB.')

    setBusy(true)
    try {
      const blob = await resizeImage(file, { maxDim, quality })
      const payload = blob || file // fall back to the original if it couldn't be decoded
      // If resize failed, the bucket still rejects originals over 5 MB — guard here.
      if (!blob && payload.size > 5 * 1024 * 1024) {
        return setError("Couldn't shrink this image — please upload one under 5 MB (JPEG or PNG).")
      }
      const ext = extForType(payload.type) || (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, payload, { upsert: true, contentType: payload.type })

      if (upErr) return setError(upErr.message)
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      // The new file is in place — drop this session's previous throwaway upload.
      const replaced = sessionPath.current
      sessionPath.current = path
      onChange(data.publicUrl)
      if (replaced && replaced !== path) removeAvatarPaths([replaced])
    } finally {
      setBusy(false)
    }
  }

  const onRemove = () => {
    // Only delete a file uploaded in this session; the DB's original is cleaned on save.
    const uploaded = sessionPath.current
    sessionPath.current = null
    onChange('')
    if (uploaded) removeAvatarPaths([uploaded])
  }

  return (
    <div className="form-group">
      <label className="field-label">
        {label} {hint && <span className="field-hint">— {hint}</span>}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Avatar name={name} src={value} size={64} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? 'Uploading…' : value ? 'Change Photo' : 'Upload Photo'}
          </button>
          {value && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onRemove} disabled={busy}>
              Remove
            </button>
          )}
        </div>
        <input ref={inputRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
      </div>
      {error && <div className="alert alert-error" style={{ marginTop: 10, marginBottom: 0 }}>{error}</div>}
    </div>
  )
}
