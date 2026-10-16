// App.jsx: top-level routing. Protects routes that require login.

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import AuthPage from './pages/AuthPage.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ConfigPage from './pages/ConfigPage.jsx'

// ProtectedRoute: redirects to login if the user isn't authenticated
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ alignItems: 'center', color: 'var(--muted)', display: 'flex',
        fontSize: '14px', justifyContent: 'center', minHeight: '100vh' }}>
        Loading...
      </div>
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
          {/* Catch-all: redirect unknown URLs to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
