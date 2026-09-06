import type { EngineId } from './engines'

export type Profile = {
  id: string
  handle: string
  full_name: string
  bio: string
  avatar_url: string | null
  paystack_subaccount: string | null
  created_at: string
}

export type Tool = {
  id: string
  owner_id: string
  slug: string
  engine: EngineId
  title: string
  tagline: string
  description: string
  emoji: string
  accent: string
  spec: unknown
  brief: string
  status: 'draft' | 'published'
  price_kobo: number
  currency: string
  view_count: number
  run_count: number
  created_at: string
  updated_at: string
  owner?: Profile
}

export type ToolRecord = {
  id: string
  tool_id: string
  data: Record<string, string>
  position: number
  created_at: string
}

export type ToolEntry = {
  id: string
  tool_id: string
  user_id: string
  data: Record<string, string | number | boolean>
  entry_date: string
  created_at: string
}

export type ToolRun = {
  id: string
  tool_id: string
  user_id: string | null
  input: Record<string, unknown>
  output: Record<string, unknown>
  created_at: string
}

export type Purchase = {
  id: string
  tool_id: string
  buyer_id: string
  reference: string
  amount_kobo: number
  currency: string
  status: 'pending' | 'paid' | 'failed'
  created_at: string
  paid_at: string | null
}

/** Naira, from kobo. 250000 becomes "₦2,500". */
export function formatPrice(kobo: number, currency = 'NGN'): string {
  if (kobo === 0) return 'Free'
  const major = kobo / 100
  const symbol = currency === 'NGN' ? '₦' : currency === 'USD' ? '$' : `${currency} `
  return `${symbol}${major.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}
