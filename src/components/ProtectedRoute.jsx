import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Gate for routes that require a logged-in user. Remembers where the user was
// headed so we can send them back there after login.
export default function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <div className="spinner" aria-label="Loading" />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />

  return <Outlet />
}
