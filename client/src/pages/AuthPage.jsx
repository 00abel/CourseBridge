// pages/AuthPage.jsx — Login and registration form

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'

export default function AuthPage() {
  const [mode, setMode] = useState('login')  // 'login' or 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, register } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register(email, password)
      }
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Logo / header */}
        <div style={styles.header}>
          <div style={styles.logo}>⇄</div>
          <h1 style={styles.title}>CourseBridge</h1>
          <p style={styles.subtitle}>
            {mode === 'login'
              ? 'Sign in to sync your assignments'
              : 'Create an account to get started'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={styles.input}
              placeholder="you@school.edu"
              required
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={styles.input}
              placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'}
              required
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" style={styles.button} disabled={loading}>
            {loading
              ? 'Please wait...'
              : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {/* Toggle between login/register */}
        <p style={styles.toggle}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            style={styles.link}
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f0f10',
    fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
    padding: '20px',
  },
  card: {
    backgroundColor: '#1a1a1d',
    border: '1px solid #2a2a2d',
    borderRadius: '16px',
    padding: '48px 40px',
    width: '100%',
    maxWidth: '400px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  logo: {
    fontSize: '32px',
    marginBottom: '12px',
  },
  title: {
    color: '#f0f0f0',
    fontSize: '22px',
    fontWeight: '600',
    margin: '0 0 8px',
    letterSpacing: '-0.3px',
  },
  subtitle: {
    color: '#888',
    fontSize: '14px',
    margin: 0,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    color: '#aaa',
    fontSize: '13px',
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#111',
    border: '1px solid #333',
    borderRadius: '8px',
    color: '#f0f0f0',
    fontSize: '15px',
    padding: '10px 14px',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  error: {
    backgroundColor: '#2a1515',
    border: '1px solid #5a2020',
    borderRadius: '8px',
    color: '#f87171',
    fontSize: '13px',
    padding: '10px 14px',
  },
  button: {
    backgroundColor: '#5865f2',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: '600',
    padding: '12px',
    marginTop: '4px',
    transition: 'opacity 0.15s',
  },
  toggle: {
    color: '#666',
    fontSize: '14px',
    marginTop: '24px',
    textAlign: 'center',
  },
  link: {
    background: 'none',
    border: 'none',
    color: '#5865f2',
    cursor: 'pointer',
    fontSize: '14px',
    padding: 0,
  },
}
