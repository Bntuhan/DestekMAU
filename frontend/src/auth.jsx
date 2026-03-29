import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as api from './api.js'

const AuthContext = createContext(null)

const TOKEN_KEY = 'destek_token'
const USER_KEY = 'destek_user'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(() => !localStorage.getItem(TOKEN_KEY))

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return

    let cancelled = false
    api
      .fetchMe()
      .then((u) => {
        if (!cancelled) {
          setUser(u)
          localStorage.setItem(USER_KEY, JSON.stringify(u))
        }
      })
      .catch(() => {
        if (!cancelled) {
          localStorage.removeItem(TOKEN_KEY)
          localStorage.removeItem(USER_KEY)
          setUser(null)
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async (email, password) => {
    const { token, user: u } = await api.login(email, password)
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(u))
    setUser(u)
    setReady(true)
    return u
  }, [])

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setUser(null)
    setReady(true)
  }, [])

  const value = useMemo(
    () => ({
      user,
      ready,
      signIn,
      signOut,
      isSuper: user?.role === 'superuser',
    }),
    [user, ready, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Hook aynı dosyada: HMR için provider ile birlikte tutuldu.
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
