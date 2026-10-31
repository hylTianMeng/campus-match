import { useQuery } from '@tanstack/react-query'
import { recruitmentApi } from '../api/recruitment'

export function useRecruitment(id: number | undefined) {
  return useQuery({
    queryKey: ['recruitment', id],
    queryFn: () => recruitmentApi.detail(id as number),
    enabled: id != null,
  })
}
