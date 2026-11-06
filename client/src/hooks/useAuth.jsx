import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../lib/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessionError, setSessionError] = useState('')

  const checkSession = async () => {
    setLoading(true)
    setSessionError('')
    try {
      if (!localStorage.getItem('token')) {
        setUser(null)
        return
      }
      const data = await api.auth.me()
      setUser(data.user)
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        localStorage.removeItem('token')
        setUser(null)
      } else {
        setSessionError('Couldn’t check your session. Try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkSession()
  }, [])

  const login = async (email, password) => {
    const data = await api.auth.login(email, password)
    localStorage.setItem('token', data.token)
    setSessionError('')
    setUser(data.user)
  }

  const register = async (email, password) => {
    const data = await api.auth.register(email, password)
    localStorage.setItem('token', data.token)
    setSessionError('')
    setUser(data.user)
  }

  const logout = () => {
    setSessionError('')
    localStorage.removeItem('token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, sessionError, checkSession, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
