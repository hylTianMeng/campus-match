export interface Person {
  id: number;
  name: string;
  dept?: string;
  year?: string;
  bio?: string;
  tags?: string[];
  avatar_url?: string | null;
}
export interface User extends Person {
  email: string;
  verified: boolean;
  banned: boolean;
  searchable: boolean;
  public_posts: boolean;
  public_teams: boolean;
  is_admin: boolean;
  avatar_url?: string | null;
}
export interface Role {
  accepting: boolean;
  application_count: number;
  id: number;
  name: string;
  capacity: number;
  accepted: number;
  description: string;
  tags: string[];
}
export interface InformationItem {
  title: string;
  type: 'text' | 'link' | 'attachment';
  content: string;
  attachment_id: number | null;
}
export interface Extras {
  items: InformationItem[];
  contact: string;
  eventIntro: string;
  mentor: string;
  outcome: string;
  activityLink: string;
  attachmentInfo: string;
  attachmentLink: string;
}
export interface Post {
  taken_down?: boolean;
  interaction_paused?: boolean;
  unavailable?: boolean;
  id: number;
  owner_id: number;
  title: string;
  category: string;
  description: string;
  tags: string[];
  place: string;
  deadline: string;
  event_time: string;
  extras: Partial<Extras>;
  attachment: { id: number; filename: string; size: number } | null;
  attachments?: { id: number; filename: string; size: number }[];
  created_at: string;
  updated_at: string;
  status: 'open' | 'ended';
  end_reason?: string;
  owner: Person;
  roles: Role[];
  pending_count: number;
  is_favorite: boolean;
}
export interface Application {
  id: number;
  post_id: number;
  role_id: number;
  user_id: number;
  applicant_name: string;
  role_name: string;
  title: string;
  post_status: string;
  post_paused?: boolean;
  status: string;
  message: string;
  experience: string;
  portfolio: string;
  reason: string;
  reapply_banned: boolean;
  created_at: string;
  events: { status: string; reason: string; created_at: string }[];
}
export interface RoleInput {
  id?: number;
  accepting?: boolean;
  accepted?: number;
  application_count?: number;
  name: string;
  capacity: number;
  description: string;
  tags: string[];
}
export interface PostInput {
  title: string;
  category: string;
  description: string;
  place: string;
  deadline: string;
  event_time: string;
  tags: string[];
  extras: Partial<Extras>;
  attachment_id?: number | null;
  attachment_name?: string;
  roles: RoleInput[];
}
export interface Draft {
  id: number;
  payload: PostInput;
  updated_at: string;
}
export interface Notice {
  kind?: string;
  target_path?: string;
  id: number;
  body: string;
  post_id: number | null;
  is_read: boolean;
  created_at: string;
}
export interface Message {
  id: number;
  sender_id: number;
  recipient_id: number;
  body: string;
  created_at: string;
}
