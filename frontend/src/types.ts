export interface Person {
  id: number;
  name: string;
  dept?: string;
  year?: string;
  bio?: string;
  tags?: string[];
}
export interface User extends Person {
  email: string;
  verified: boolean;
  banned: boolean;
  searchable: boolean;
  public_posts: boolean;
  public_teams: boolean;
}
export interface Role {
  id: number;
  name: string;
  capacity: number;
  accepted: number;
  description: string;
  tags: string[];
}
export interface Extras {
  contact: string;
  eventIntro: string;
  mentor: string;
  outcome: string;
  activityLink: string;
  attachmentInfo: string;
  attachmentLink: string;
}
export interface Post {
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
  created_at: string;
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
  status: string;
  message: string;
  experience: string;
  portfolio: string;
  reason: string;
  created_at: string;
  events: { status: string; reason: string; created_at: string }[];
}
export interface RoleInput {
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
  roles: RoleInput[];
}
export interface Draft {
  id: number;
  payload: PostInput;
  updated_at: string;
}
export interface Notice {
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
