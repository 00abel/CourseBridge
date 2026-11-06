import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import AuthPage from './pages/AuthPage.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ConfigPage from './pages/ConfigPage.jsx'

function ProtectedRoute({ children }) {
  const { user, loading, sessionError, checkSession } = useAuth()

  if (loading) {
    return (
      <div style={{ alignItems: 'center', color: 'var(--muted)', display: 'flex',
        fontSize: '14px', justifyContent: 'center', minHeight: '100vh' }}>
        Loading...
      </div>
    )
  }

  if (sessionError) {
    return (
      <main className="page">
        <p role="alert">{sessionError}</p>
        <button type="button" className="btn btn-primary" onClick={checkSession}>Retry</button>
      </main>
    )
  }

  return user ? children : <Navigate to="/" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AuthPage />} />
          <Route path="/dashboard" element={
            <ProtectedRoute><Dashboard /></ProtectedRoute>
          } />
          <Route path="/config" element={
            <ProtectedRoute><ConfigPage /></ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
