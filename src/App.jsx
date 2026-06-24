import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { isSupabaseConfigured } from './lib/supabaseClient'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
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
const SessionScore = lazy(() => import('./pages/SessionScore'))
const MySessions = lazy(() => import('./pages/MySessions'))
const Profile = lazy(() => import('./pages/Profile'))
const EditProfile = lazy(() => import('./pages/EditProfile'))
const UserProfile = lazy(() => import('./pages/UserProfile'))
const GameDetail = lazy(() => import('./pages/GameDetail'))
const Messages = lazy(() => import('./pages/Messages'))
const Conversation = lazy(() => import('./pages/Conversation'))

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

        <Route element={<ProtectedRoute />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<OnboardingGate />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Browse />} />
              <Route path="/create" element={<CreateSessionChooser />} />
              <Route path="/create/one-time" element={<CreateSession />} />
              <Route path="/create/weekly" element={<CreateWeeklySession />} />
              <Route path="/my-sessions" element={<MySessions />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/profile/edit" element={<EditProfile />} />
              <Route path="/users/:id" element={<UserProfile />} />
              <Route path="/games/:name" element={<GameDetail />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/messages/:userId" element={<Conversation />} />
              <Route path="/sessions/:id" element={<SessionDetail />} />
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
