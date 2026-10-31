import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { recruitmentApi, RecruitmentListParams } from '../api/recruitment'

export function useRecruitments(filters: RecruitmentListParams = {}) {
  return useQuery({
    queryKey: ['recruitments', filters],
    queryFn: () => recruitmentApi.list(filters),
    placeholderData: keepPreviousData,
  })
}
