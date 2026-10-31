import { request } from './client'
import type { PageResponse } from '../types/api'
import type {
  RecruitmentCreateRequest,
  RecruitmentDetailOut,
  RecruitmentListOut,
  RecruitmentUpdateRequest,
} from '../types/recruitment'
import type { ApplicationOut } from '../types/application'

export interface RecruitmentListParams {
  q?: string
  tag?: string
  status?: string
  sort?: string
  page?: number
  page_size?: number
}

export const recruitmentApi = {
  list: (params: RecruitmentListParams) =>
    request.get<PageResponse<RecruitmentListOut>>('/recruitments', { params }),
  mine: (params: RecruitmentListParams) =>
    request.get<PageResponse<RecruitmentListOut>>('/recruitments/mine', {
      params,
    }),
  detail: (id: number) => request.get<RecruitmentDetailOut>(`/recruitments/${id}`),
  create: (data: RecruitmentCreateRequest) =>
    request.post<RecruitmentDetailOut>('/recruitments', data),
  update: (id: number, data: RecruitmentUpdateRequest) =>
    request.put<RecruitmentDetailOut>(`/recruitments/${id}`, data),
  publish: (id: number) =>
    request.post<RecruitmentDetailOut>(`/recruitments/${id}/publish`),
  end: (id: number) => request.post<RecruitmentDetailOut>(`/recruitments/${id}/end`),
  remove: (id: number) => request.delete<null>(`/recruitments/${id}`),
  addPosition: (id: number, data: { name: string; capacity: number; description?: string }) =>
    request.post(`/recruitments/${id}/positions`, data),
  removePosition: (id: number, positionId: number) =>
    request.delete<null>(`/recruitments/${id}/positions/${positionId}`),
  listApplications: (id: number, params?: { page?: number; page_size?: number }) =>
    request.get<PageResponse<ApplicationOut>>(`/recruitments/${id}/applications`, {
      params,
    }),
}
