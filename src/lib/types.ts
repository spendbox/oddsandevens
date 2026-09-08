/** The shapes stored in the database, as the app reads them. */

export type Profile = {
  id: string
  email: string
  display_name: string
  coins: number
  bank_name: string
  bank_code: string
  account_number: string
  account_name: string
  account_verified_at: string | null
  /** False while an email alone is enough to sign in. See migration 0004. */
  password_set: boolean
  created_at: string
}

export type Box = {
  id: string
  code: string
  creator_id: string
  creator_name: string
  title: string
  description: string
  image_url: string
  prize_naira: number
  status: 'open' | 'won'
  winner_id: string | null
  winner_name: string
  won_at: string | null
  attempts_count: number
  best_level: number
  created_at: string
}

export type Attempt = {
  id: string
  box_id: string
  user_id: string
  player_name: string
  status: 'playing' | 'won' | 'failed'
  level: number
  levels_cleared: number
  replays_left: number
  awaiting_replay: boolean
  pattern: number[] | null
  pattern_level: number | null
  shown_at: string | null
  deadline_at: string | null
  coins_spent: number
  created_at: string
  finished_at: string | null
}

export type Topup = {
  id: string
  user_id: string
  coins: number
  amount_kobo: number
  reference: string
  status: 'pending' | 'success' | 'failed'
  created_at: string
  paid_at: string | null
}

export type LedgerEntry = {
  id: string
  user_id: string
  kind: 'topup' | 'play' | 'refund' | 'bonus'
  coins: number
  memo: string
  created_at: string
}

export type Payout = {
  id: string
  box_id: string
  user_id: string
  role: 'creator' | 'winner'
  amount_naira: number
  status: 'pending' | 'paid'
  note: string
  created_at: string
  paid_at: string | null
}
