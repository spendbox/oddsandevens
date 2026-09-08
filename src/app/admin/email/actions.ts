'use server'

import { isAdmin, requireProfile } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { emailShell, sendEmail } from '@/lib/email'

export type TestState = { ok?: string; problem?: string }

/**
 * Send a real email, to the admin, and report exactly what came back.
 *
 * This exists because "no email arrived" is the least useful bug report a
 * system can produce, and this one produced it twice. Everything between the
 * button and the inbox — the key, the sending domain, the address, Resend
 * itself — either works here or fails here with the actual message attached.
 */
export async function sendTestEmail(
  _state: TestState,
  formData: FormData,
): Promise<TestState> {
  const { profile } = await requireProfile()
  if (!isAdmin(profile.email)) return { problem: 'Not allowed.' }

  const to = String(formData.get('to') ?? '').trim() || profile.email
  const stamp = new Date().toISOString()

  try {
    await sendEmail({
      to,
      subject: `Spendbox test email · ${stamp.slice(11, 19)}`,
      html: emailShell({
        heading: 'Your email setup works',
        body:
          'This is a test sent from the Spendbox admin page. If you are reading it, ' +
          `the API key, the sending domain and the address are all good. Sent at ${stamp}.`,
        buttonLabel: 'Open Spendbox',
        buttonUrl: 'https://www.spendbox.site',
        footer: 'Nobody else received this.',
      }),
      text: `Your Spendbox email setup works. Sent at ${stamp}.`,
    })

    return {
      ok:
        `Resend accepted it for ${to}. If nothing arrives in a few minutes, check the spam ` +
        'folder and then the Resend dashboard — accepted is not the same as delivered.',
    }
  } catch (error) {
    return { problem: error instanceof Error ? error.message : String(error) }
  }
}

export type ProbeResult = {
  hasKey: boolean
  from: string | null
  tableReady: boolean
  tableProblem: string | null
  recent: { email: string; created_at: string; used_at: string | null }[]
}

/**
 * The state of everything a password reset depends on.
 *
 * The missing table is the other way this fails in complete silence: if
 * migration 0005 was never run, the token insert fails and nothing is sent.
 */
export async function probeEmailSetup(): Promise<ProbeResult> {
  const admin = supabaseAdmin()

  let tableReady = false
  let tableProblem: string | null = null
  let recent: ProbeResult['recent'] = []

  try {
    const { error } = await admin
      .from('password_resets')
      .select('id', { count: 'exact', head: true })

    if (error) tableProblem = error.message
    else tableReady = true
  } catch (error) {
    tableProblem = error instanceof Error ? error.message : String(error)
  }

  if (tableReady) {
    const { data } = await admin
      .from('password_resets')
      .select('user_id, created_at, used_at')
      .order('created_at', { ascending: false })
      .limit(5)

    const ids = (data ?? []).map((row) => row.user_id)
    const { data: people } = ids.length
      ? await admin.from('profiles').select('id, email').in('id', ids)
      : { data: [] }

    const emailById = new Map((people ?? []).map((person) => [person.id, person.email]))

    recent = (data ?? []).map((row) => ({
      email: emailById.get(row.user_id) ?? 'unknown',
      created_at: row.created_at,
      used_at: row.used_at,
    }))
  }

  return {
    hasKey: Boolean(process.env.RESEND_API_KEY?.trim()),
    from: process.env.EMAIL_FROM?.trim() || null,
    tableReady,
    tableProblem,
    recent,
  }
}
