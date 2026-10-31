import { request } from './client'
import type { PageResponse } from '../types/api'
import type { ApplicationOut, ApplicationSubmitRequest } from '../types/application'

export const applicationApi = {
  submit: (rid: number, pid: number, data: ApplicationSubmitRequest) =>
    request.post<ApplicationOut>(
      `/recruitments/${rid}/positions/${pid}/applications`,
      data,
    ),
  mine: (params?: { page?: number; page_size?: number }) =>
    request.get<PageResponse<ApplicationOut>>('/applications/mine', { params }),
  approve: (id: number) => request.post<ApplicationOut>(`/applications/${id}/approve`),
  reject: (id: number) => request.post<ApplicationOut>(`/applications/${id}/reject`),
  withdraw: (id: number) => request.post<ApplicationOut>(`/applications/${id}/withdraw`),
  abandon: (id: number) => request.post<ApplicationOut>(`/applications/${id}/abandon`),
  revoke: (id: number) => request.post<ApplicationOut>(`/applications/${id}/revoke`),
}
