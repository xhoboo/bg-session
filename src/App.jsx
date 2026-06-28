import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { isSupabaseConfigured } from './lib/supabaseClient'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import PublicGate from './components/PublicGate'
import OnboardingGate from './components/OnboardingGate'
import SetupNotice from './components/SetupNotice'

// Pages are code-split so each route ships its own chunk, loaded on demand —
// the initial bundle stays small and navigation pulls in only what it needs.
const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const AuthCallback = lazy(() => import('./pages/AuthCallback'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Browse = lazy(() => import('./pages/Browse'))
const CreateSessionChooser = lazy(() => import('./pages/CreateSessionChooser'))
const CreateSession = lazy(() => import('./pages/CreateSession'))
const CreateWeeklySession = lazy(() => import('./pages/CreateWeeklySession'))
const EditSession = lazy(() => import('./pages/EditSession'))
const SessionDetail = lazy(() => import('./pages/SessionDetail'))
const GuestSessionDetail = lazy(() => import('./pages/GuestSessionDetail'))
const SessionScore = lazy(() => import('./pages/SessionScore'))
const MySessions = lazy(() => import('./pages/MySessions'))
const Profile = lazy(() => import('./pages/Profile'))
const EditProfile = lazy(() => import('./pages/EditProfile'))
const NotificationSettings = lazy(() => import('./pages/NotificationSettings'))
const UserProfile = lazy(() => import('./pages/UserProfile'))
const GameDetail = lazy(() => import('./pages/GameDetail'))
const Messages = lazy(() => import('./pages/Messages'))
const Conversation = lazy(() => import('./pages/Conversation'))

// Session detail is public: guests get a read-only view, signed-in users the
// full interactive page. (Onboarding is still enforced for signed-in users by
// the surrounding PublicGate.)
function SessionDetailRoute() {
  const { user } = useAuth()
  return user ? <SessionDetail /> : <GuestSessionDetail />
}

export default function App() {
  const { loading } = useAuth()

  if (!isSupabaseConfigured) return <SetupNotice />
  if (loading) return <div className="spinner" aria-label="Loading" />

  return (
    <Suspense fallback={<div className="spinner" aria-label="Loading" />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        <Route path="/onboarding" element={<ProtectedRoute />}>
          <Route index element={<Onboarding />} />
        </Route>

        <Route element={<Layout />}>
          {/* Public — open to guests; a signed-in-but-not-onboarded user is
              still pushed to /onboarding by PublicGate. */}
          <Route element={<PublicGate />}>
            <Route path="/" element={<Browse />} />
            <Route path="/games/:name" element={<GameDetail />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/sessions/:id" element={<SessionDetailRoute />} />
          </Route>

          {/* Everything else requires a signed-in, onboarded user. Guests who
              reach these (FAB, Sessions/Messages tabs, a session card) are sent
              to /login by ProtectedRoute. */}
          <Route element={<ProtectedRoute />}>
            <Route element={<OnboardingGate />}>
              <Route path="/create" element={<CreateSessionChooser />} />
              <Route path="/create/one-time" element={<CreateSession />} />
              <Route path="/create/weekly" element={<CreateWeeklySession />} />
              <Route path="/my-sessions" element={<MySessions />} />
              <Route path="/profile/edit" element={<EditProfile />} />
              <Route path="/settings/notifications" element={<NotificationSettings />} />
              <Route path="/users/:id" element={<UserProfile />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/messages/:userId" element={<Conversation />} />
              <Route path="/sessions/:id/score" element={<SessionScore />} />
              <Route path="/sessions/:id/edit" element={<EditSession />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
