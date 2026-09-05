'use client'

import { useTransition } from 'react'
import { answerConnection } from '@/lib/connections'

export function AnswerButtons({ connectionId }: { connectionId: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(() => {
            void answerConnection(connectionId, true, '/people')
          })
        }
        className="btn btn-primary flex-1"
      >
        Accept
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(() => {
            void answerConnection(connectionId, false, '/people')
          })
        }
        className="btn btn-quiet"
      >
        Not now
      </button>
    </div>
  )
}
