import { useQuery } from '@tanstack/react-query'
import { messageApi } from '../api/message'

export function useUnread() {
  return useQuery({
    queryKey: ['unread'],
    queryFn: () => messageApi.unread(),
    refetchInterval: 10000,
  })
}
