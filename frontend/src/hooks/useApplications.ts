import { useQuery } from '@tanstack/react-query'
import { applicationApi } from '../api/application'

export function useApplications() {
  return useQuery({
    queryKey: ['applications', 'mine'],
    queryFn: () => applicationApi.mine({ page_size: 50 }),
  })
}
