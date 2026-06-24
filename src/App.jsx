import { Routes, Route, Navigate } from 'react-router-dom'
import { isSupabaseConfigured } from './lib/supabaseClient'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import OnboardingGate from './components/OnboardingGate'
import SetupNotice from './components/SetupNotice'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ResetPassword from './pages/ResetPassword'
import AuthCallback from './pages/AuthCallback'
import Onboarding from './pages/Onboarding'
import Browse from './pages/Browse'
import CreateSessionChooser from './pages/CreateSessionChooser'
import CreateSession from './pages/CreateSession'
import CreateWeeklySession from './pages/CreateWeeklySession'
import EditSession from './pages/EditSession'
import SessionDetail from './pages/SessionDetail'
import SessionScore from './pages/SessionScore'
import MySessions from './pages/MySessions'
import Profile from './pages/Profile'
import EditProfile from './pages/EditProfile'
import UserProfile from './pages/UserProfile'
import GameDetail from './pages/GameDetail'
import Messages from './pages/Messages'
import Conversation from './pages/Conversation'

export default function App() {
  const { loading } = useAuth()

  if (!isSupabaseConfigured) return <SetupNotice />
  if (loading) return <div className="spinner" aria-label="Loading" />

  return (
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
  )
}
