import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import Brand from '../components/Brand.jsx'

function SyncArt() {
  return (
    <div className="sync-art">
      <div className="sync-row" role="img" aria-label="Assignments moving from Canvas into Notion">
        <div className="sync-canvas">
          <img src="/canvas-logo.png" alt="" width="78" height="78" />
        </div>
        <div className="sync-line">
          <div className="chip"><span /><span /></div>
          <div className="chip"><span /><span /></div>
          <div className="chip"><span /><span /></div>
          <svg className="sync-arrow" width="14" height="16" viewBox="0 0 14 16" aria-hidden="true">
            <path d="M2 2 L12 8 L2 14 Z" fill="#0a0a0a" />
          </svg>
        </div>
        <img src="/notion-logo.png" alt="" width="92" height="96" />
      </div>
      <div className="sync-caption">
        <span>CANVAS</span>
        <i aria-hidden="true" />
        <span>NOTION</span>
      </div>
    </div>
  )
}

export default function AuthPage() {
  const [mode, setMode] = useState('login')
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

  const isLogin = mode === 'login'

  return (
    <div className="auth">
      <aside className="auth-aside">
        <Brand />
        <SyncArt />
        <div className="auth-pitch">
          <h2>Bring your Canvas assignments into Notion.</h2>
          <p>Let’s get organized!</p>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-form-wrap">
          <Brand className="auth-mobile-brand" />

          <h1>{isLogin ? 'Log in' : 'Create an account'}</h1>
          <p className="lede">
            {isLogin ? 'Log in to sync your assignments.' : 'Create an account, then connect Canvas and Notion.'}
          </p>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="field">
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@school.edu"
                autoComplete="email"
                required
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={isLogin ? 'Your password' : 'At least 8 characters'}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                required
              />
            </div>

            {error && <div className="notice notice-error" role="alert">{error}</div>}

            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading && <span className="spinner" />}
              {loading ? 'Please wait' : isLogin ? 'Log in' : 'Create account'}
            </button>
          </form>

          <p className="auth-switch">
            {isLogin ? 'New here? ' : 'Already have an account? '}
            <button
              className="link-btn"
              onClick={() => { setMode(isLogin ? 'register' : 'login'); setError('') }}
            >
              {isLogin ? 'Create an account' : 'Log in'}
            </button>
          </p>
        </div>
      </main>
    </div>
  )
}
