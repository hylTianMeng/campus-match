export type ApplicationStatus = 'pending' | 'accepted' | 'not_passed' | 'withdrawn' | 'expired'

export interface ApplicationOut {
  id: number
  recruitment_id: number
  position_id: number
  applicant_id: number
  message: string | null
  status: ApplicationStatus
  reason: string
  created_at: string
  decided_at: string | null
  position: { id: number; name: string } | null
  recruitment: { id: number; title: string; status: string } | null
  applicant: { id: number; nickname: string; avatar_url: string | null } | null
}

export interface ApplicationSubmitRequest {
  message?: string
}
