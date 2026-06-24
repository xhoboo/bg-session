// Downscale an image File in the browser before upload so the Storage bucket and
// bandwidth stay small (photos are kept in Supabase Storage, only their URL goes
// in the database). Returns a re-encoded Blob on success, or null when the browser
// can't decode the image (e.g. some HEIC files in Chrome) so callers fall back to
// uploading the original file untouched.
export async function resizeImage(file, { maxDim = 1280, quality = 0.82, type = 'image/webp' } = {}) {
  if (!file?.type?.startsWith('image/')) return null

  let bitmap
  try {
    bitmap = await loadBitmap(file)
  } catch {
    return null // undecodable here — caller uses the original file
  }

  const sw = bitmap.width
  const sh = bitmap.height
  // Only ever shrink, never upscale.
  const scale = Math.min(1, maxDim / Math.max(sw, sh))
  const w = Math.max(1, Math.round(sw * scale))
  const h = Math.max(1, Math.round(sh * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.() // release ImageBitmap memory (no-op for <img>)

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality))
  // toBlob can yield null (unsupported type) — signal fallback to the original.
  return blob || null
}

// Prefer createImageBitmap (fast, off-DOM, honours EXIF orientation); fall back
// to an <img> + object URL when it's unavailable or rejects the file.
async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // fall through to the <img> path
    }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (err) => {
      URL.revokeObjectURL(url)
      reject(err)
    }
    img.src = url
  })
}

// Map a MIME type to the file extension we store it under.
export function extForType(type) {
  return (
    { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/avif': 'avif' }[type] || ''
  )
}
