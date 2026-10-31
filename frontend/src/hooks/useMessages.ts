import { useQuery } from '@tanstack/react-query'
import { messageApi } from '../api/message'

export function useMessages(cid: number | undefined) {
  return useQuery({
    queryKey: ['messages', cid],
    queryFn: () => messageApi.listMessages(cid as number, { limit: 50 }),
    enabled: cid != null,
    refetchInterval: 10000,
  })
}
