'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { ArrowRight, Coins, Link2, Package } from 'lucide-react'
import { Button, Card, Field } from '@/components/ui'
import { LEVELS } from '@/lib/game'
import { naira, playPricePhrase } from '@/lib/money'
import { createBox } from './actions'

/**
 * The prize is a prop rather than a constant, because it is a number an admin
 * can move from /admin/users and this card is the last thing somebody reads
 * before committing to a box. Quoting a stale figure here would be promising
 * one amount and creating another.
 */
function boxSteps(prize: number) {
  return [
    {
      Icon: Package,
      title: 'Your box holds ' + naira(prize),
      body:
        'Making it costs you nothing. The prize sits on the box from the moment it exists, ' +
        'and it stays there until somebody beats it.',
    },
    {
      Icon: Link2,
      title: 'You share the link',
      body:
        `Anyone who opens it can take a go — a go ${playPricePhrase()} — so the link is worth ` +
        'sending to anybody. You are never charged for anyone playing your box.',
    },
    {
      Icon: Coins,
      title: 'Somebody beats it, you both earn',
      body:
        `They have to clear all ${LEVELS} patterns against the clock. When someone finally does, ` +
        `they get ${naira(prize)} — and so do you.`,
    },
  ]
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" tone="gold" size="lg" disabled={pending} className="w-full">
      {pending ? 'Building your box…' : 'Create my box — free'}
    </Button>
  )
}

/**
 * Making a box, walked through.
 *
 * The three cards are not filler. Almost nobody arrives understanding that
 * creating is free, that players pay rather than the creator, and that the
 * creator is paid too — and all three are the reasons to do it. So they are
 * shown one at a time, in that order, before the button that commits.
 */
export function CreateBox({ prize }: { prize: number }) {
  const [step, setStep] = useState(0)
  const steps = boxSteps(prize)
  const onLastStep = step === steps.length - 1
  const current = steps[step]

  return (
    <Card className="bg-linear-to-br from-gold/12 via-violet/10 to-cyan/8">
      <div className="mb-5 flex gap-1.5" aria-hidden>
        {steps.map((_, index) => (
          <div
            key={index}
            className={
              'h-1 flex-1 rounded-full transition ' +
              (index <= step ? 'bg-gold' : 'bg-white/12')
            }
          />
        ))}
      </div>

      <div key={step} className="animate-rise">
        <current.Icon size={34} className="text-gold" />
        <h2 className="mt-3 text-xl font-bold tracking-tight">{current.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-mist">{current.body}</p>
      </div>

      {onLastStep ? (
        <form action={createBox} className="mt-6 grid gap-4">
          <Field
            label="Name your box (optional)"
            name="title"
            maxLength={60}
            placeholder="Friday night challenge"
            hint="Whatever you call it shows up on the link you share."
          />
          <Submit />
          <button
            type="button"
            onClick={() => setStep(0)}
            className="text-sm text-dusk underline underline-offset-4 hover:text-mist"
          >
            Read that again
          </button>
        </form>
      ) : (
        <div className="mt-6 flex items-center gap-3">
          <Button type="button" tone="gold" size="lg" onClick={() => setStep(step + 1)}>
            Next <ArrowRight size={17} />
          </Button>
          <button
            type="button"
            onClick={() => setStep(steps.length - 1)}
            className="text-sm text-mist underline underline-offset-4 hover:text-chalk"
          >
            Skip — I know how it works
          </button>
        </div>
      )}
    </Card>
  )
}
