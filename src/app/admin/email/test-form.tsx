'use client'

import { useActionState } from 'react'
import { Send } from 'lucide-react'
import { Button, Note, Problem } from '@/components/ui'
import { sendTestEmail, type TestState } from './actions'

export function TestForm({ defaultTo }: { defaultTo: string }) {
  const [state, action, pending] = useActionState<TestState, FormData>(sendTestEmail, {})

  return (
    <form action={action} className="grid gap-3">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-mist">Send a test to</span>
        <input
          name="to"
          type="email"
          defaultValue={defaultTo}
          className="h-12 w-full rounded-2xl border border-white/12 bg-black/30 px-4 text-base
                     text-chalk focus:border-violet/60 focus:outline-none focus:ring-2
                     focus:ring-violet/25"
        />
      </label>

      {state.problem ? (
        <Problem>
          <span className="font-semibold">Resend refused it.</span>{' '}
          <span className="font-mono text-xs">{state.problem}</span>
        </Problem>
      ) : null}
      {state.ok ? <Note>{state.ok}</Note> : null}

      <Button type="submit" disabled={pending}>
        <Send size={16} /> {pending ? 'Sending…' : 'Send test email'}
      </Button>
    </form>
  )
}
