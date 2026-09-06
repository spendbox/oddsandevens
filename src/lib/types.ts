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
  /** Standing across Commons. Shown on a profile, never inside a pursuit. */
  points: number
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
  /** The stage this person is working on now. Everything before it is finished. */
  stage_id: string | null
  intent: string
  role: 'member' | 'steward'
  joined_at: string
  /** Standing earned inside this pursuit. Gates adding to its knowledge base. */
  points: number
}

/** A membership with progress counted from the stages actually finished. */
export type MembershipWithProgress = Membership & {
  pursuit: Pursuit
  stage: Stage | null
  completed: number
  totalStages: number
  progress: number
}

export type PostKind = 'question' | 'update' | 'insight' | 'win' | 'reflection'

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
  useful_count: number
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

/** Finishing a stage, and the public account of how you did it. */
export type StageCompletion = {
  id: string
  pursuit_id: string
  user_id: string
  stage_id: string
  what_i_did: string
  what_was_hard: string
  post_id: string | null
  completed_at: string
  author?: Profile
  stage?: Stage
}

export type Badge = {
  slug: string
  name: string
  description: string
  emoji: string
}

export type UserBadge = {
  id: string
  user_id: string
  badge_slug: string
  pursuit_id: string | null
  stage_id: string | null
  label: string
  earned_at: string
  badge?: Badge
}

export type Quiz = {
  id: string
  pursuit_id: string
  user_id: string
  stage_id: string | null
  title: string
  description: string
  attempt_count: number
  created_at: string
  author?: Profile
  questions?: QuizQuestion[]
}

export type QuizQuestion = {
  id: string
  quiz_id: string
  position: number
  prompt: string
  options: string[]
  correct_index: number
  explanation: string
}

export type QuizAttempt = {
  id: string
  quiz_id: string
  user_id: string
  score: number
  total: number
  created_at: string
}

export type ChecklistConfig = { items: string[] }
export type CalculatorConfig = {
  inputs: { key: string; label: string }[]
  formula: string
  unit: string
}

export type Tool = {
  id: string
  pursuit_id: string
  user_id: string
  stage_id: string | null
  kind: 'checklist' | 'calculator'
  title: string
  description: string
  config: ChecklistConfig | CalculatorConfig
  use_count: number
  created_at: string
  author?: Profile
}

export type PointEvent = {
  id: string
  user_id: string
  actor_id: string | null
  pursuit_id: string | null
  kind: string
  points: number
  subject_type: string
  subject_id: string | null
  created_at: string
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
