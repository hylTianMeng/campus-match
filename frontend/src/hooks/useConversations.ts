import { useQuery } from '@tanstack/react-query'
import { messageApi } from '../api/message'

export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: () => messageApi.listConversations(),
    refetchInterval: 10000,
  })
}
