// pages/AuthPage.jsx: login and registration form

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import Brand from '../components/Brand.jsx'

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

  const isLogin = mode === 'login'

  return (
    <div className="auth">
      <aside className="auth-aside">
        <Brand />

        <div className="auth-pitch">
          <h2>Every class, every due date, in one place.</h2>
          <p>
            CourseBridge pulls your assignments out of Canvas and keeps a Notion
            database up to date, so you stop digging through five different course pages.
          </p>
          <ol className="auth-steps">
            <li><span>1</span>Connect your Canvas account</li>
            <li><span>2</span>Point it at a Notion database</li>
            <li><span>3</span>Hit sync whenever you want</li>
          </ol>
        </div>

        <p className="auth-foot">Canvas is read only. CourseBridge never changes anything there.</p>

        <svg className="auth-arc" viewBox="0 0 400 240" fill="none" aria-hidden="true"
          stroke="#fff" strokeWidth="6" strokeLinecap="round">
          <path d="M20 220C80 80 150 30 200 30s120 50 180 190" />
          <path d="M10 220h380M90 220v-90M145 220v-150M200 220v-190M255 220v-150M310 220v-90" />
        </svg>
      </aside>

      <main className="auth-main">
        <div className="auth-form-wrap">
          <Brand className="auth-mobile-brand" />

          <h1>{isLogin ? 'Welcome back' : 'Create your account'}</h1>
          <p className="lede">
            {isLogin ? 'Sign in to sync your assignments.' : 'It takes about a minute to set up.'}
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
              {loading ? 'Please wait' : isLogin ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p className="auth-switch">
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <button
              className="link-btn"
              onClick={() => { setMode(isLogin ? 'register' : 'login'); setError('') }}
            >
              {isLogin ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </main>
    </div>
  )
}
