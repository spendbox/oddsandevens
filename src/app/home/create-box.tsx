'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, Card, Field } from '@/components/ui'
import { PRIZE_NAIRA, naira } from '@/lib/money'
import { createBox } from './actions'

function CreateButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" tone="gold" size="lg" disabled={pending} className="w-full sm:w-auto">
      {pending ? 'Building your box…' : `Drop a ${naira(PRIZE_NAIRA)} box`}
    </Button>
  )
}

/**
 * Making a box is one tap, so it is one button — the name field only appears if
 * somebody asks for it. A form that opens with an empty text box implies work
 * that isn't there.
 */
export function CreateBox() {
  const [naming, setNaming] = useState(false)

  return (
    <Card className="bg-linear-to-br from-gold/12 to-violet/12">
      <form action={createBox} className="grid gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Drop a new box</h2>
          <p className="mt-1.5 text-sm text-mist">
            Free to make. Share the link, and if anyone beats it you are paid{' '}
            {naira(PRIZE_NAIRA)} — the same as the winner.
          </p>
        </div>

        {naming ? (
          <Field
            label="Name it (optional)"
            name="title"
            maxLength={60}
            autoFocus
            placeholder="Friday night challenge"
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <CreateButton />
          {!naming ? (
            <button
              type="button"
              onClick={() => setNaming(true)}
              className="text-sm font-medium text-mist underline underline-offset-4 hover:text-chalk"
            >
              Give it a name
            </button>
          ) : null}
        </div>
      </form>
    </Card>
  )
}
