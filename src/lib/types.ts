export type Profile = {
  id: string
  handle: string
  full_name: string
  headline: string
  bio: string
  location: string
  avatar_url: string | null
  skills: string[]
  interests: string[]
  onboarded: boolean
}

export type Pursuit = {
  id: string
  slug: string
  title: string
  tagline: string
  description: string
  category: string
  emoji: string
  accent: string
  tags: string[]
  member_count: number
  created_by: string | null
  created_at: string
}

export type Stage = {
  id: string
  pursuit_id: string
  name: string
  description: string
  position: number
}

export type Membership = {
  id: string
  pursuit_id: string
  user_id: string
  stage_id: string | null
  progress: number
  intent: string
  role: 'member' | 'steward'
  joined_at: string
}

export type PostKind = 'question' | 'update' | 'insight' | 'win'

export type Post = {
  id: string
  pursuit_id: string
  author_id: string
  kind: PostKind
  title: string
  body: string
  stage_id: string | null
  reply_count: number
  useful_count: number
  created_at: string
  author?: Profile
}

export type Reply = {
  id: string
  post_id: string
  author_id: string
  body: string
  created_at: string
  author?: Profile
}

export type AskKind = 'need' | 'offer'

export type Ask = {
  id: string
  pursuit_id: string
  user_id: string
  kind: AskKind
  title: string
  body: string
  tags: string[]
  status: 'open' | 'matched' | 'closed'
  created_at: string
  author?: Profile
}

export type Resource = {
  id: string
  pursuit_id: string
  user_id: string | null
  kind: 'book' | 'tool' | 'template' | 'course' | 'link' | 'experience'
  title: string
  url: string | null
  description: string
  stage_id: string | null
  vote_count: number
  created_at: string
  author?: Profile
}

export type CommonsEvent = {
  id: string
  pursuit_id: string
  created_by: string | null
  kind: 'meetup' | 'workshop' | 'challenge' | 'ama' | 'session'
  title: string
  description: string
  starts_at: string
  ends_at: string | null
  location: string
  is_virtual: boolean
  url: string | null
  rsvp_count: number
}

export type StageCount = {
  stage_id: string
  stage_name: string
  stage_position: number
  people: number
}

export type ProgressUpdate = {
  id: string
  pursuit_id: string
  user_id: string
  stage_id: string | null
  from_progress: number | null
  to_progress: number
  note: string
  is_milestone: boolean
  created_at: string
  author?: Profile
}

export type Connection = {
  id: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted' | 'declined'
  reason: string
  pursuit_id: string | null
  created_at: string
}
