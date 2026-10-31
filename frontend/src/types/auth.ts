export interface User {
  id: number
  email: string
  nickname: string
  avatar_url: string | null
  department: string | null
  grade: string | null
  bio: string | null
  is_verified: boolean
  status: string
  created_at: string | null
}

export interface TokenPair {
  access_token: string
  refresh_token: string
}

export interface AuthResult extends TokenPair {
  user: User
}

export interface RegisterRequest {
  email: string
  password: string
  nickname: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface ProfileUpdateRequest {
  nickname: string
  department?: string
  grade?: string
  bio?: string
}
