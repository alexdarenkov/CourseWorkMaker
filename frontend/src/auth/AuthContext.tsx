import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { authApi } from '../api'
import type { User } from '../lib/settings'
import { loadToken, saveToken } from '../lib/storage'

interface AuthState {
  user: User | null
  loading: boolean
  signIn: (token: string, user: User) => void
  signOut: () => void
  setUser: (user: User) => void
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  signIn: () => {},
  signOut: () => {},
  setUser: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(!!loadToken())

  useEffect(() => {
    if (!loadToken()) return
    authApi
      .me()
      .then(setUser)
      .catch(() => saveToken(null))
      .finally(() => setLoading(false))
  }, [])

  const signIn = useCallback((token: string, u: User) => {
    saveToken(token)
    setUser(u)
  }, [])

  const signOut = useCallback(() => {
    saveToken(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, signIn, signOut, setUser }),
    [user, loading, signIn, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  return useContext(AuthContext)
}
