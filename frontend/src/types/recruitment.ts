export type RecruitmentStatus = 'draft' | 'open' | 'ended'
export type PositionStatus = 'available' | 'full' | 'closed'

export interface OwnerBrief {
  id: number
  nickname: string
  avatar_url: string | null
}

export interface PositionOut {
  id: number
  name: string
  capacity: number
  description: string | null
  sort_order: number
  accepted_count: number
  status: PositionStatus
  tags: string[]
}

export interface PositionIn {
  name: string
  capacity: number
  description?: string
}

export interface RecruitmentListOut {
  id: number
  owner_id: number
  title: string
  location: string | null
  activity_time: string | null
  deadline_at: string
  status: RecruitmentStatus
  end_reason: string | null
  published_at: string | null
  created_at: string
  owner: OwnerBrief
  tags: string[]
  positions: PositionOut[]
}

export interface MyApplicationBrief {
  id: number
  position_id: number
  status: string
  reason: string
}

export interface AllowedActions {
  apply: boolean
  edit: boolean
  publish: boolean
  end: boolean
  delete: boolean
  manage_applications: boolean
}

export interface RecruitmentDetailOut extends RecruitmentListOut {
  description: string
  ended_at: string | null
  updated_at: string | null
  my_applications: MyApplicationBrief[]
  allowed_actions: AllowedActions
}

export interface RecruitmentCreateRequest {
  title: string
  description: string
  location?: string
  activity_time?: string
  deadline_at: string
  status: 'draft' | 'open'
  tags?: string[]
  positions: PositionIn[]
}

export interface RecruitmentUpdateRequest {
  title?: string
  description?: string
  location?: string
  activity_time?: string
  deadline_at?: string
  tags?: string[]
}
