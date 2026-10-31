import { request } from './client'
import type {
  AuthResult,
  LoginRequest,
  ProfileUpdateRequest,
  RegisterRequest,
  TokenPair,
  User,
} from '../types/auth'

export const authApi = {
  register: (data: RegisterRequest) =>
    request.post<AuthResult>('/auth/register', data),
  login: (data: LoginRequest) => request.post<AuthResult>('/auth/login', data),
  refresh: (refresh_token: string) =>
    request.post<TokenPair>('/auth/refresh', { refresh_token }),
  logout: () => request.post<null>('/auth/logout'),
  me: () => request.get<User>('/auth/me'),
  updateProfile: (data: ProfileUpdateRequest) =>
    request.put<User>('/auth/me/profile', data),
}
