import type { Ask, Membership, Profile, Stage } from './types'

/**
 * Why two people in the same pursuit should meet.
 *
 * The rule this file exists to enforce: a suggested person is never presented
 * without a reason. "8,421 members" is a directory; "Sarah has already launched
 * two SaaS products, you are validating your first" is an introduction. Every
 * score below carries the sentence that explains it.
 *
 * The scoring is deliberately deterministic and readable rather than opaque.
 * It runs on data the pursuit already has — stages, skills, and the needs and
 * offers people posted themselves — so a suggestion can always be traced back
 * to something a person actually said about themselves.
 */

export type Person = {
  profile: Profile
  membership: Membership
  asks: Ask[]
}

export type Match = {
  profile: Profile
  score: number
  /** The single strongest reason, shown on the card. */
  reason: string
  /** Everything that matched, strongest first. */
  signals: string[]
  relation: 'ahead' | 'peer' | 'behind' | 'complementary'
}

type Signal = { weight: number; text: string; relation?: Match['relation'] }

const normalise = (value: string) => value.toLowerCase().trim()

/** Skills, tags and free text all get compared on the same footing. */
function overlap(a: string[], b: string[]): string[] {
  const right = new Set(b.map(normalise))
  return a.filter((item) => right.has(normalise(item)))
}

/** Does this ask's subject matter line up with what this person can do? */
function askMatchesSkills(ask: Ask, skills: string[]): string[] {
  const haystack = normalise(`${ask.title} ${ask.body} ${ask.tags.join(' ')}`)
  const direct = overlap(skills, ask.tags)
  const mentioned = skills.filter((skill) => {
    const s = normalise(skill)
    return s.length > 3 && haystack.includes(s)
  })
  return Array.from(new Set([...direct, ...mentioned]))
}

function list(items: string[]): string {
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function stagePosition(stages: Stage[], stageId: string | null): number | null {
  if (!stageId) return null
  return stages.find((stage) => stage.id === stageId)?.position ?? null
}

function stageName(stages: Stage[], stageId: string | null): string {
  if (!stageId) return 'no stage yet'
  return stages.find((stage) => stage.id === stageId)?.name ?? 'no stage yet'
}

/**
 * Score one candidate against the viewer, inside one pursuit.
 * Returns null when there is no honest reason to suggest them.
 */
export function scorePerson(viewer: Person, candidate: Person, stages: Stage[]): Match | null {
  if (viewer.profile.id === candidate.profile.id) return null

  const signals: Signal[] = []

  const myStage = stagePosition(stages, viewer.membership.stage_id)
  const theirStage = stagePosition(stages, candidate.membership.stage_id)
  const gap = myStage !== null && theirStage !== null ? theirStage - myStage : null

  // The strongest signal in the product: someone is offering exactly what you
  // said you needed.
  const myNeeds = viewer.asks.filter((ask) => ask.kind === 'need' && ask.status === 'open')
  const theirOffers = candidate.asks.filter((ask) => ask.kind === 'offer' && ask.status === 'open')

  for (const need of myNeeds) {
    for (const offer of theirOffers) {
      const shared = overlap(need.tags, offer.tags)
      if (shared.length > 0) {
        signals.push({
          weight: 100 + shared.length * 5,
          text: `Offers help with ${list(shared)} — which you asked for`,
          relation: 'complementary',
        })
      }
    }
    const bySkill = askMatchesSkills(need, candidate.profile.skills)
    if (bySkill.length > 0) {
      signals.push({
        weight: 80,
        text: `Knows ${list(bySkill.slice(0, 2))}, which your request needs`,
        relation: 'complementary',
      })
    }
  }

  // The mirror image: you are the answer to something they posted. This is what
  // turns a member into a contributor.
  const theirNeeds = candidate.asks.filter((ask) => ask.kind === 'need' && ask.status === 'open')
  for (const need of theirNeeds) {
    const bySkill = askMatchesSkills(need, viewer.profile.skills)
    if (bySkill.length > 0) {
      signals.push({
        weight: 70,
        text: `Needs ${list(bySkill.slice(0, 2))} — which you have`,
        relation: 'behind',
      })
    }
  }

  // Someone a little further down the same road. Far enough to have learned
  // something, close enough to remember what your problem feels like.
  if (gap !== null && gap >= 1 && gap <= 2) {
    signals.push({
      weight: 60 - (gap - 1) * 10,
      text: `${gap === 1 ? 'One stage' : 'Two stages'} ahead of you — already at ${stageName(stages, candidate.membership.stage_id)}`,
      relation: 'ahead',
    })
  } else if (gap !== null && gap > 2) {
    signals.push({
      weight: 35,
      text: `Has been all the way to ${stageName(stages, candidate.membership.stage_id)}`,
      relation: 'ahead',
    })
  } else if (gap !== null && gap === 0) {
    signals.push({
      weight: 40,
      text: `At exactly the same stage as you — ${stageName(stages, candidate.membership.stage_id)}`,
      relation: 'peer',
    })
  } else if (gap !== null && gap < 0) {
    signals.push({
      weight: 30,
      text: `Behind you, at ${stageName(stages, candidate.membership.stage_id)} — you have done this part`,
      relation: 'behind',
    })
  }

  const sharedSkills = overlap(viewer.profile.skills, candidate.profile.skills)
  if (sharedSkills.length > 0) {
    signals.push({
      weight: 20 + sharedSkills.length * 3,
      text: `Shares your ${list(sharedSkills.slice(0, 2))} background`,
      relation: 'peer',
    })
  }

  // Complementary rather than shared: they have skills you do not, in a pursuit
  // you are both committed to.
  const theyBring = candidate.profile.skills.filter(
    (skill) => !viewer.profile.skills.map(normalise).includes(normalise(skill)),
  )
  if (theyBring.length >= 3 && sharedSkills.length === 0) {
    signals.push({
      weight: 25,
      text: `Brings ${list(theyBring.slice(0, 2))} to a pursuit you are both in`,
      relation: 'complementary',
    })
  }

  if (
    viewer.profile.location &&
    candidate.profile.location &&
    normalise(viewer.profile.location) === normalise(candidate.profile.location)
  ) {
    signals.push({ weight: 30, text: `Also in ${candidate.profile.location}`, relation: 'peer' })
  }

  if (signals.length === 0) return null

  signals.sort((a, b) => b.weight - a.weight)
  const top = signals[0]

  return {
    profile: candidate.profile,
    score: signals.reduce((total, signal, index) => total + signal.weight / (index + 1), 0),
    reason: top.text,
    signals: signals.map((signal) => signal.text),
    relation: top.relation ?? 'peer',
  }
}

/** The ranked "people you should meet" list for one pursuit. */
export function suggestPeople(
  viewer: Person,
  candidates: Person[],
  stages: Stage[],
  limit = 6,
): Match[] {
  return candidates
    .map((candidate) => scorePerson(viewer, candidate, stages))
    .filter((match): match is Match => match !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/**
 * The other half of the loop. When you move forward, the people you just
 * overtook become people you can help — and telling you so is what stops a
 * pursuit from being a place where everyone only ever asks.
 */
export function peopleYouCouldHelp(
  viewer: Person,
  candidates: Person[],
  stages: Stage[],
  limit = 6,
): Match[] {
  const myStage = stagePosition(stages, viewer.membership.stage_id)
  if (myStage === null) return []

  return candidates
    .filter((candidate) => {
      if (candidate.profile.id === viewer.profile.id) return false
      const theirStage = stagePosition(stages, candidate.membership.stage_id)
      return theirStage !== null && theirStage < myStage
    })
    .map((candidate) => {
      const theirNeeds = candidate.asks.filter((ask) => ask.kind === 'need' && ask.status === 'open')
      const answerable = theirNeeds.flatMap((need) => askMatchesSkills(need, viewer.profile.skills))
      const theirStage = stagePosition(stages, candidate.membership.stage_id) ?? 0

      return {
        profile: candidate.profile,
        score: (myStage - theirStage) * 10 + answerable.length * 25,
        reason:
          answerable.length > 0
            ? `Asking for ${list(Array.from(new Set(answerable)).slice(0, 2))} — you have it`
            : `At ${stageName(stages, candidate.membership.stage_id)}, the stage you came through`,
        signals: [],
        relation: 'behind' as const,
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/**
 * Pursuit suggestions for the home page: pursuits you are not in, ranked by
 * how much they overlap what you already do and care about.
 */
export function suggestPursuits<T extends { id: string; tags: string[]; title: string; member_count: number }>(
  profile: Profile,
  pursuits: T[],
  joinedIds: Set<string>,
  limit = 4,
): { pursuit: T; reason: string }[] {
  const vocabulary = [...profile.skills, ...profile.interests]

  return pursuits
    .filter((pursuit) => !joinedIds.has(pursuit.id))
    .map((pursuit) => {
      const shared = overlap(vocabulary, pursuit.tags)
      const titleHit = vocabulary.filter(
        (word) => normalise(word).length > 3 && normalise(pursuit.title).includes(normalise(word)),
      )
      const score = shared.length * 30 + titleHit.length * 20 + Math.min(pursuit.member_count / 100, 10)
      return {
        pursuit,
        score,
        reason:
          shared.length > 0
            ? `Matches your ${list(shared.slice(0, 2))}`
            : titleHit.length > 0
              ? `Close to your ${list(titleHit.slice(0, 1))} work`
              : `${pursuit.member_count.toLocaleString()} people pursuing this`,
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ pursuit, reason }) => ({ pursuit, reason }))
}
