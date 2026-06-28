import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Gate for routes that are open to guests (not-signed-in visitors) but should
// still force a logged-in user to finish onboarding before they linger here.
// Guests pass straight through; a signed-in user who hasn't onboarded is sent to
// /onboarding, matching what OnboardingGate does for the protected routes.
export default function PublicGate() {
  const { user, profile, profileLoaded } = useAuth()

  if (!user) return <Outlet /> // guest — public content is allowed
  if (!profileLoaded) return <div className="spinner" aria-label="Loading" />
  if (!profile || !profile.onboarded) return <Navigate to="/onboarding" replace />

  return <Outlet />
}
