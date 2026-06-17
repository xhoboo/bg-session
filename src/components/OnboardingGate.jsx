import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Sits between auth and the main app: a logged-in user who hasn't completed
// their profile is sent to /onboarding before they can use anything else.
export default function OnboardingGate() {
  const { profile, profileLoaded } = useAuth()

  if (!profileLoaded) return <div className="spinner" aria-label="Loading" />
  if (!profile || !profile.onboarded) return <Navigate to="/onboarding" replace />

  return <Outlet />
}
