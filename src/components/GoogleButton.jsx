import { useAuth } from '../context/AuthContext'

// Reusable "Continue with Google" button used on both Login and Signup.
export default function GoogleButton({ onError }) {
  const { signInWithGoogle } = useAuth()

  const handle = async () => {
    const { error } = await signInWithGoogle()
    if (error && onError) onError(error.message)
  }

  return (
    <button type="button" className="btn btn-google btn-block" onClick={handle}>
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8a12 12 0 1 1 0-24c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 1 0 24 44c11 0 20-9 20-20 0-1.3-.1-2.3-.4-3.5z"/>
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8A12 12 0 0 1 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z"/>
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
        <path fill="#1976D2" d="M43.6 20.5H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C41.1 36.7 44 31 44 24c0-1.3-.1-2.3-.4-3.5z"/>
      </svg>
      Continue with Google
    </button>
  )
}
