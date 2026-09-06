/**
 * Turning "I want to learn AI automation this year" into a pursuit.
 *
 * Nobody sits down able to name the six stages of a journey they have not
 * taken yet, and an empty list of boxes is where most people give up. So the
 * platform proposes a shape and lets them argue with it — editing a suggestion
 * is a far easier task than inventing one.
 *
 * The archetypes below are matched on the words people actually use. This is
 * deliberately readable rather than clever: you can see exactly why a given
 * journey was proposed, and a language model can be dropped in behind the same
 * function later without anything around it changing.
 */

export type SuggestedStage = { name: string; description: string }

type Archetype = {
  id: string
  category: string
  emoji: string
  accent: string
  keywords: string[]
  stages: SuggestedStage[]
}

const ARCHETYPES: Archetype[] = [
  {
    id: 'skill',
    category: 'skill',
    emoji: '📘',
    accent: 'sky',
    keywords: [
      'learn', 'master', 'study', 'course', 'skill', 'understand', 'teach myself',
      'python', 'code', 'coding', 'programming', 'design', 'language', 'ai',
      'automation', 'data', 'writing', 'speak', 'guitar', 'piano', 'photography',
    ],
    stages: [
      { name: 'Getting oriented', description: 'Working out what this actually involves.' },
      { name: 'First real attempt', description: 'Making something badly, on purpose.' },
      { name: 'Building something', description: 'A project you would show another person.' },
      { name: 'Working unaided', description: 'Solving problems without a tutorial open.' },
      { name: 'Teaching someone else', description: 'The point at which you know you know it.' },
    ],
  },
  {
    id: 'business',
    category: 'business',
    emoji: '🚀',
    accent: 'violet',
    keywords: [
      'business', 'startup', 'company', 'saas', 'product', 'launch', 'revenue',
      'customers', 'freelance', 'agency', 'shop', 'store', 'sell', 'profitable',
      'side project', 'founder', 'app',
    ],
    stages: [
      { name: 'Idea', description: 'Something you cannot stop thinking about.' },
      { name: 'Validating', description: 'Talking to people who might pay for it.' },
      { name: 'Building', description: 'Making the first version.' },
      { name: 'Beta', description: 'Real people are using it.' },
      { name: 'Launched', description: 'It is public and earning.' },
      { name: 'Profitable', description: 'It pays for itself and then some.' },
    ],
  },
  {
    id: 'relocate',
    category: 'life',
    emoji: '📍',
    accent: 'amber',
    keywords: [
      'move', 'moving', 'relocate', 'immigrate', 'emigrate', 'visa', 'abroad',
      'canada', 'australia', 'germany', 'uk', 'america', 'passport', 'citizenship',
    ],
    stages: [
      { name: 'Researching', description: 'Working out which route applies to you.' },
      { name: 'Documents', description: 'Tests, credentials, proof of funds.' },
      { name: 'Applied', description: 'Submitted and waiting.' },
      { name: 'Approved', description: 'Confirmation in hand, planning the move.' },
      { name: 'Landed', description: 'Arrived and finding your feet.' },
      { name: 'Settled', description: 'Work, housing and people in place.' },
    ],
  },
  {
    id: 'fitness',
    category: 'health',
    emoji: '🏃',
    accent: 'rose',
    keywords: [
      'run', 'running', 'marathon', 'gym', 'fitness', 'fit', 'weight', 'lose',
      'strength', 'exercise', 'swim', 'cycle', 'health', 'training', 'muscle',
    ],
    stages: [
      { name: 'Starting out', description: 'Showing up at all.' },
      { name: 'Building the habit', description: 'It happens whether you feel like it or not.' },
      { name: 'Going further', description: 'Past what used to be your limit.' },
      { name: 'The hard block', description: 'The training that actually changes you.' },
      { name: 'The day itself', description: 'Race, test, or whatever you were building towards.' },
      { name: 'Kept it up', description: 'Still doing it a year later.' },
    ],
  },
  {
    id: 'money',
    category: 'money',
    emoji: '🔥',
    accent: 'orange',
    keywords: [
      'money', 'save', 'saving', 'debt', 'invest', 'investing', 'financial',
      'retire', 'wealth', 'income', 'budget', 'pension', 'freedom',
    ],
    stages: [
      { name: 'Getting clear', description: 'Knowing exactly what comes in and goes out.' },
      { name: 'Clearing debt', description: 'Paying off what you owe.' },
      { name: 'Building a buffer', description: 'Enough saved to survive a bad month.' },
      { name: 'Growing income', description: 'Raises, side income, better rates.' },
      { name: 'Investing steadily', description: 'Money working without you.' },
      { name: 'Work optional', description: 'Income covers life without a job.' },
    ],
  },
  {
    id: 'creative',
    category: 'creative',
    emoji: '🎨',
    accent: 'violet',
    keywords: [
      'write', 'writing', 'book', 'novel', 'blog', 'music', 'album', 'song',
      'art', 'paint', 'draw', 'film', 'video', 'podcast', 'youtube', 'publish',
    ],
    stages: [
      { name: 'Finding the idea', description: 'The one you keep coming back to.' },
      { name: 'First draft', description: 'Finished, not good. That is the job.' },
      { name: 'Making it good', description: 'Rewriting, cutting, doing it properly.' },
      { name: 'Showing people', description: 'Feedback from someone who will be honest.' },
      { name: 'Finished', description: 'You stopped changing it.' },
      { name: 'Out in the world', description: 'Published, released, seen.' },
    ],
  },
  {
    id: 'habit',
    category: 'life',
    emoji: '🌱',
    accent: 'emerald',
    keywords: [
      'habit', 'daily', 'every day', 'quit', 'stop', 'routine', 'meditate',
      'meditation', 'read more', 'sleep', 'drinking', 'smoking', 'discipline',
    ],
    stages: [
      { name: 'Deciding', description: 'Naming exactly what changes, and when.' },
      { name: 'The first week', description: 'The part that runs on willpower alone.' },
      { name: 'The first month', description: 'Past the point most people stop.' },
      { name: 'Automatic', description: 'You no longer negotiate with yourself about it.' },
      { name: 'Part of who you are', description: 'It would be strange not to.' },
    ],
  },
  {
    id: 'career',
    category: 'skill',
    emoji: '💼',
    accent: 'sky',
    keywords: [
      'job', 'career', 'promotion', 'interview', 'hired', 'hiring', 'portfolio',
      'switch', 'change career', 'salary', 'role', 'work in',
    ],
    stages: [
      { name: 'Getting clear', description: 'Deciding what you are actually aiming at.' },
      { name: 'Closing the gap', description: 'The skills or proof you are missing.' },
      { name: 'Putting it out', description: 'Portfolio, CV, applications, conversations.' },
      { name: 'In process', description: 'Interviews and the waiting between them.' },
      { name: 'Offer', description: 'Someone said yes.' },
      { name: 'Established', description: 'Past probation and good at it.' },
    ],
  },
]

const FALLBACK: SuggestedStage[] = [
  { name: 'Getting started', description: 'Working out what this involves.' },
  { name: 'Finding your footing', description: 'Past the confusing part.' },
  { name: 'Doing the work', description: 'The long middle where most progress happens.' },
  { name: 'Making it real', description: 'Something to show for it.' },
  { name: 'Finished', description: 'The thing you set out to do is done.' },
]

/** How strongly an intent matches an archetype. */
function score(intent: string, archetype: Archetype): number {
  const text = ` ${intent.toLowerCase()} `
  return archetype.keywords.reduce(
    (total, keyword) => (text.includes(` ${keyword}`) ? total + keyword.length : total),
    0,
  )
}

export type Suggestion = {
  stages: SuggestedStage[]
  category: string
  emoji: string
  accent: string
  archetype: string
  /** Why this shape was proposed, shown to the person so it is not a black box. */
  because: string
}

export function suggestForIntent(intent: string): Suggestion {
  const ranked = ARCHETYPES.map((archetype) => ({ archetype, points: score(intent, archetype) }))
    .filter((row) => row.points > 0)
    .sort((a, b) => b.points - a.points)

  const best = ranked[0]?.archetype

  if (!best) {
    return {
      stages: FALLBACK,
      category: 'other',
      emoji: '🎯',
      accent: 'violet',
      archetype: 'general',
      because: 'A general shape to start from — rename anything that does not fit.',
    }
  }

  const matched = best.keywords.filter((keyword) => ` ${intent.toLowerCase()} `.includes(` ${keyword}`))

  return {
    stages: best.stages,
    category: best.category,
    emoji: best.emoji,
    accent: best.accent,
    archetype: best.id,
    because: `Suggested because you mentioned ${matched
      .slice(0, 2)
      .map((word) => `“${word}”`)
      .join(' and ')}.`,
  }
}

/**
 * "I want to learn AI automation this year" becomes "Learn AI Automation".
 * People type a sentence; a pursuit needs a name.
 */
export function titleFromIntent(intent: string): string {
  let text = intent.trim().replace(/\s+/g, ' ')

  const openers = [
    /^i\s+(really\s+)?want\s+to\s+/i, /^i'?d\s+like\s+to\s+/i, /^i\s+need\s+to\s+/i,
    /^i\s+am\s+trying\s+to\s+/i, /^i'?m\s+trying\s+to\s+/i, /^how\s+(do|can)\s+i\s+/i,
    /^help\s+me\s+/i, /^looking\s+to\s+/i, /^trying\s+to\s+/i, /^my\s+goal\s+is\s+to\s+/i,
  ]
  for (const opener of openers) text = text.replace(opener, '')

  // Trailing deadlines belong to a person, not to a shared pursuit.
  text = text.replace(
    /\s+(this|next)\s+(year|month|week|quarter)\b|\s+(in|by|before)\s+\d{4}\b|\s+someday\b/gi,
    '',
  )
  text = text.replace(/[.?!]+$/, '').trim()

  const small = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'my', 'at'])
  return text
    .split(' ')
    .filter(Boolean)
    .map((word, index) => {
      const lower = word.toLowerCase()
      if (index > 0 && small.has(lower)) return lower
      if (word.length <= 3 && word === word.toUpperCase()) return word
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
    .slice(0, 120)
}
