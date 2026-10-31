import { request } from './client'
import type { ProfileUpdateRequest, User } from '../types/auth'

export const userApi = {
  updateProfile: (data: ProfileUpdateRequest) =>
    request.put<User>('/auth/me/profile', data),
}
