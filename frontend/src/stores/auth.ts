import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types/auth'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: User | null
  setTokens: (pair: { access_token: string; refresh_token: string }) => void
  setUser: (user: User) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setTokens: (pair) =>
        set({ accessToken: pair.access_token, refreshToken: pair.refresh_token }),
      setUser: (user) => set({ user }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: 'campus-crew-auth' },
  ),
)
