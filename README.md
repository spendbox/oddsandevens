# Spendbox

**Guess the password. Open the safe.**

A spendbox is a password with money behind it. You aren't told how long it is.
Every guess costs one life and comes back with one number: how close you are,
out of 100. What that number is made of is never explained. Reach 100% and the
money is yours.

Playing is free: seven lives, one back every hour, forever.

---

## The two kinds of box

There is one game. It comes in two versions, and the only difference is whose
money is behind the reward.

**A platform box** is authored in `/admin` and funded by the platform. Free,
nothing to collect, no split. There used to be exactly one, enforced by a
unique partial index, on the reasoning that the public game is *the* public
game. 0032 dropped that: what leads the front page is now whichever boxes an
admin has *featured*, from either side, so there is no longer any reason for
ours to be singular.

**A contributor box** is anyone else's. A contributor writes a password, puts
money behind it, and shares the link. There is no business here: no trading name,
no logo, no category, no verification. A contributor is a person who put money
behind a password and wants people to attack it.

---

## Guessing

A password is 3 to 26 characters from the 26 letters (both cases), ten digits,
every symbol on a QWERTY keyboard, the space, and a handful beyond the
keyboard — `• √ π ÷ × § ∆ £ ¢ € ¥ ° © ® ™ ✓` — 111 in all. Anything you can
type or paste is fair game.

Space was excluded at first, on the grounds that a password you can't tell the
length of by eye shouldn't also be one you can't tell the *shape* of by eye.
It's in now — a password game that forbids the most common character in a
passphrase is a strange game — and the objection is answered where it belongs,
in the rendering: everywhere a guess or a password is shown back, a space is
drawn as `␣`.

**Case is part of the password.** `k` and `K` are different characters, which
roughly squares the search space and is, with the symbols, why a box takes
hundreds of attempts rather than a dozen.

An attempt answers two things:

| | |
| --- | --- |
| **Length** | Too short, too long, or exactly right. Nothing ever says how long the password is — that's the first thing you have to hunt. |
| **Score** | How close the guess is, as a percentage of a perfect one. |

Every position contributes to the score, and place and case are independent
questions — so a character gets four possible verdicts, not three:

| | right place | wrong place |
| --- | --- | --- |
| **right case** | most | middle |
| **wrong case** | middle | least |

Getting the position right is always worth something, and the two ways of being
one step away — right case in the wrong place, wrong case in the right place —
are worth the same as each other. That equality is deliberate: it is the
cheapest honest way to make a total that has several explanations.

0027 got this wrong for a while, scoring the wrong-place pass case-blind and
above the right-place-wrong-case one, so a character walked across the positions
made the score *dip* exactly where it belonged. 0048 is the fix, and it rescored
every attempt ever made so the board is on one scale.

**How much each is worth is not published** — not in the app, not in the API,
not in any copy. Two very different guesses can score the same, and working out
which explanation fits is the game.

The denominator is the longer of the guess and the password, so padding a
correct prefix out dilutes the score rather than being free. That's what makes
**100% mean solved and nothing else**.

A guess shorter than the password is compared over its own length, and can
still find a character that lives further along — which is what makes
length-hunting playable.

The password is read, compared and dropped **inside Postgres** — `score_attempt`
and `spend_attempt` are plpgsql, so it never enters application memory at all.

---

## Lives

A player holds **7 lives**, and **one comes back every hour** — 24 a day, free,
forever. They're held by the *player*, not by a box: one pool spent across the
public box and every contributor box alike.

**One life buys one guess**, win or lose. There is no bounded "run", no cap on
how many attempts a box takes, and no ceiling on how fast you may make them —
only on how many lives you have. A hard box is a siege, not a sitting.

Lives can also be bought at **₦150 each**, up to 100 at a time. Nobody has to
— the pool refills whether or not anyone pays, and the buy dialog says so
before it says anything else.

### Rewards

A cracked safe pays out **within 24 hours** — to an account already on file. If
the winner hadn't added one, the clock runs from when they do, which is most of
why the tutorial ends on the bank screen rather than mentioning it in passing.

### Life Bank

The ceiling is the real cost of a long hunt: an evening away banks seven
guesses and every hour after that is thrown away. **₦2,500 buys a week** of a
ceiling of 24, and fills you to it on the spot — a ceiling that takes
seventeen hours to become visible is a purchase that appears to have done
nothing.

It sits in the buy-lives dialog with the other two, because all three answer
the same question in different units: lives are *quantity*, Second Wind is
*time*, Life Bank is *headroom*. Buying a second week while one is running
adds to what's left rather than replacing it — a renewal that threw away the
remainder would punish renewing early.

A week is sold through `life_orders` like a top-up, but it buys no lives
outright, so the row carries `quantity = 0` and a `bank_` reference. The prefix
is what settlement reads — nothing infers intent from the zero — and 0046 is
what makes a zero legal at all, on the condition that only a bank may write
one. Until it, the column's original `between 1 and 100` rejected every Life
Bank order at the insert and the dialog reported a payment problem for what was
a schema one.

The ceiling is a column on `players` with an expiry beside it (0037, 0039), and
`life_cap` falls back to the platform default the moment that passes rather
than at the next purchase or on a sweep that might never run. **A lapsed week
never takes lives away**: somebody holding nineteen keeps all nineteen and
simply stops accruing until they are back under seven.

Admins can grant lives from `/admin`, to an address that has never played if
need be. It's the only honest fix when something breaks on our side.

### Invites

Every player has an invite code. When somebody who arrived on their link pays
for **10 lives or more**, five free lives are banked for each of them. The
inviter's stacks without limit — ten paying invitees is fifty lives — and for
the invitee it means buying ten and leaving with fifteen.

Both land on the recipient's **next** paid top-up rather than immediately.
That's the whole reason `bonus_lives_pending` is a column and not a credit: a
bonus that appeared instantly would just be a discount, and one that lands next
time is a reason to come back.

Bonus lives are free lives. Nobody is charged for them, so they never enter a
price and never see the 70/30 split.

The ordering inside `settle_life_purchase` is the feature and is why it's one
function rather than three calls: bonuses banked *before* a purchase are paid
out with it, and the qualification that purchase might trigger is banked
*after*, so a purchase can never qualify itself. Self-referral is closed three
ways — a player can't be their own inviter (a check constraint), an inviter is
attached once and never changed, and each invited player qualifies exactly
once however often they top up.

---

## The breakdown is a purchase

By default a score is one opaque number. **Colour Read** (1.5% of the reward)
splits every attempt — the ones already made included — into its four parts: exact hits,
right-place-wrong-case hits, right-character-wrong-place hits, and characters that are in
there in the other case *and* another position.

It lasts **24 hours** and can be bought again after that. Alone among the
power-ups it rents rather than sells: everything else hands over a fact that
stays true forever, while this changes how the whole board reads and would
otherwise be one payment that permanently halves the game. The expiry is
checked against a clock on the server, so a page left open stops receiving
component counts the moment the window closes.

It is withheld on the server, not hidden in the browser. `buildPlayView` never
puts the component counts on the wire for a hunt that hasn't bought them, so
there is nothing to reveal by poking at the page.

It is also, measurably, about half the game — see the table below.

---

## Difficulty

Every box shows a difficulty tier, and **the tier is all anybody sees** —
players and contributors alike. The attempt estimate is a deterministic
function of the password's length, so printing it anywhere public would hand
over the exact answer to the first thing a player has to work out; a tier only
narrows the length to a band of five or six.

Contributors used to get the full reading, since they wrote the password and
already know its length. It's gone. It was two more numbers on a screen that
had plenty, it never changed what anyone did next, and keeping it meant every
new surface was one slip away from leaking it. `estimateAttempts` still exists
and still backs the model below; nothing in the app prints it.

The model is the strategy the feedback actually permits: binary-search the
length (~5 attempts), then walk the positions one at a time, because a *count*
with no positions attached can only be read by changing one position and
watching it move.

| Length | Tier | Free play | With Colour Read |
| --- | --- | --- | --- |
| 3 | Warm | 229 | 155 |
| 6 | Tricky | 512 | 269 |
| 10 | Hard | 889 | 481 |
| 18 | Brutal | 1,649 | 876 |
| 26 | Merciless | 2,394 | 1,355 |

Both columns are measured, not guessed: a solver implementing the only strategy
the scoring permits, median of 15 random passwords per length. It cracks 15/15
at every length in both modes. This table is the reason the tiers sit where
they do; it is documentation, not a screen.

Why free play costs nearly twice as much: with a single number, the only safe
reading of a position is "try every character and keep the best". Thresholds on
the delta don't work — the character already sitting there may itself be
scoring, and a misplaced character is worth more than a right-place-wrong-case
one, so a naive argmax over one case gets led to the wrong answer. Only an
exact hit is guaranteed to top the scale, and proving you've found it means
trying all 93 other characters. With the breakdown, an exact hit announces
itself and the scan stops roughly halfway.

---

## Power-ups

The only thing a player ever pays for, and the only way a contributor makes
money back. They carry much more weight than they would in a gentler game:
each one deletes a specific chunk of a hundreds-of-attempts grind.

| Power-up | Price | What it does |
| --- | --- | --- |
| Length Lock | 0.5% | Tells you exactly how many characters the password has |
| Vowel Scan | 0.5% | Counts the vowels, A E I O U, either case |
| Second Wind | 0.5% | Unlimited guesses on this box for 15 minutes. No lives spent at all |
| Consonant Scan | 1.25% | Counts the consonants — every letter that isn't a vowel |
| Colour Read | 1.5% | Splits every score, past and future, into its four parts — for 24 hours |
| Space Count | 5% | Counts the spaces |
| X-Ray | 5% | Names half the distinct characters, unordered. Once |
| Digit Count | 7.5% | Counts the digits |
| Lowercase Count | 8.5% | Counts the lowercase letters |
| Capital Count | 9% | Counts the capital letters |
| Symbol Count | 10% | Counts the symbols — anything that isn't a letter, digit or space |
| **Power Pack** | **30%** | Every power-up still on this shelf, in one purchase |

Those eleven come to **49.3%** of a reward bought separately, so the Power Pack
is about a third off for taking all of them at once. That discount is the
product: somebody buying the whole shelf is giving up the part of the game
where you decide *which* hint is worth having, and the price should say so.

It is not an effect of its own. `apply` recurses through itself for the pack,
folding `revealed` from one power-up into the next, which is what keeps X-Ray
drawing from the pool the counters left it and means there is exactly one
description of what each power-up does. It is only buyable while something is
left to put in it, it buys what is still available and nothing else, and the
price does not drop to match a half-empty shelf.

Every price here is a default. `POWER_UP_KINDS` drives the admin pricing panel,
so the pack's share and floor are editable there like any other.

The shelf is ordered **cheapest first**, which is the order above. It used to
be in catalogue order — the order they happened to be written in — so a
₦70,000 counter sat above a ₦3,500 one and the cheap end was somewhere in the
middle. Price is the axis a player is actually sorting by.

**Every price is editable from `/admin`**, per power-up and globally: the share
of the reward, the floor, what a life costs, what a week of Life Bank costs,
and what Spendbox keeps of a sale. The constants above are defaults and stay
authoritative for anything nobody has touched — a missing settings row, an
empty object and an untouched key all behave identically to a build with no
settings at all. Overrides are clamped both when saved and when read, so a
share typed as `50` instead of `0.5` can neither be stored nor honoured.

**Prices are a share of the box's reward**, floored so that a challenge box
with nothing behind it still has a shelf to sell. A hint that saves you a
fortnight of grinding on a ₦7,000,000 safe is not worth what the same hint is
worth on a ₦7,000 one, and a flat price got that wrong in both directions. The
Every floor is at least ₦100, and that one is not a design choice: Paystack
refuses a transaction below it, so a price under ₦100 is a checkout that opens
and then fails. `MIN_PRICE_KOBO` is the backstop that makes it impossible to
introduce a share low enough to fall through on a small box.

Every dialog on the shelf **runs the effect** before it describes it: a
four-second CSS loop of the power-up happening to a made-up nine-character
password. A paragraph asks a player to imagine the result at exactly the moment
they are deciding whether to spend real money on it, and the sample is fixed
and fictional so the demo can never be a hint.

### The counters

Seven of them, one number each, sold once. They replaced **Case Map**, which
sold all four composition numbers at a single price — and a single price is the
problem, because those four numbers are worth wildly different amounts.
Knowing there are no symbols removes about thirty candidates from every
position; knowing there are no spaces removes one. Sold separately they can be
priced by how much of the search each actually cuts, which is why Symbol Count
is twenty times a Vowel Scan.

`Revealed.scans` is the one place a count lives, and `parseRevealed` folds an
old `caseMap` into it on read — so a hunt that paid for Case Map before it was
retired keeps all four of its numbers, with no legacy field for the rest of the
app to keep knowing about.

**Life Bank** is not on this shelf, and never should have been. Every other
thing here is a fact about *one password*; that is a change to the life pool,
which is shared across every safe. It is sold beside lives now — see below.

The *share* is server-side only. A player is shown what something costs on the
box in front of them and nothing about how that number was reached — and
`Offering`, the shape that goes over the wire, deliberately does not extend
`PowerUpSpec`, so the percentage isn't in the API response either. Printing it
would have turned the shelf into a way of measuring the box.

Each one is tied to a specific thing the scoring withholds — the length, what
the password is made of, the pace of the game, the components behind a score,
half the characters — and each says on its own dialog what it deliberately does
*not* do. Nothing buys on a tap: tapping opens the full explanation, and paying
is a second, deliberate action inside it.

Nothing is revealed at checkout. The order is created `pending` and the effect
only fires once Paystack confirms the money, so a cancelled payment reveals
nothing. The note a purchase produces is stored on the order, which means
re-verifying a reference replays the same answer rather than re-rolling a
random X-Ray.

### Second Wind and the life pool

Second Wind is the only power-up that doesn't reveal anything. It writes an
expiry onto the hunt, and `spend_attempt` checks it *before* the life pool:
while it runs, a guess needs no life and spends none. That check has to live in
the migration rather than in a route, because the route is not the thing that
decrements the counter.

The window is read defensively — a malformed timestamp in `revealed` fails
closed, charging a life as usual, rather than aborting the guess.

It has been shortened twice, an hour to thirty minutes (0042) and thirty to
fifteen (0047), at an unchanged price. Both times for the same reason: free
guessing is a great deal of the game for half a percent of the reward, and a
window long enough to walk an alphabet through a position funds grinding rather
than the thing it is for. Fifteen minutes has to be aimed — you buy it holding
a hypothesis you want to test now. Two places set the duration and they must
agree: `SECOND_WIND_MINUTES` for the bought one, `claim_offer` for the free one
a gift hands out.

### Buying one twice

Length Lock, the seven counters and Life Bank sell once: the answer is
permanent and complete, so a second sale would be a second copy of it. Second Wind and Colour
Read rent a window and are buyable again the moment it lapses.

X-Ray is neither. Each purchase draws from the characters it *hasn't* named,
which is what makes a second one worth making — a fresh draw over the whole set
would mostly re-name characters already paid for, which is a sale of nothing.
So every purchase adds something, enough of them name the lot, and the shelf
withdraws it once there is nothing left rather than taking money for it.
`charsetTotal` is stored on the hunt so availability can be decided at all; it
discloses nothing, since the note on the first purchase already says "4 of the
7 characters it uses".

### Availability never leaks the password

A greyed-out power-up must not become a free hint, so every availability rule
is decided from public facts — what the player has already bought, and a length
they have already paid to learn — and never from the password. Anything that
would need the password to decide stays on sale.

---

## Money

Everything is stored in kobo. The split is 70/30 in the contributor's favour on
everything that has a contributor attached.

### Funding

What a contributor pays in **is** the reward. 70% of it is what a player is chasing;
Spendbox keeps 30% for running the box. It is collected in full up front, so a
winner is never waiting on a contributor to be good for it.

The floor rises with the password's length, because a longer password is a
harder box and a harder box has to be worth attacking:

| Characters | Minimum funding | Reward at the floor |
| --- | --- | --- |
| 3 | ₦10,000 | ₦7,000 |
| 4 | ₦60,000 | ₦42,000 |
| 5 | ₦160,000 | ₦112,000 |
| 6 | ₦410,000 | ₦287,000 |
| 7 | ₦910,000 | ₦637,000 |
| 8 | ₦1,410,000 | ₦987,000 |
| … | +₦500,000 each | |
| 25 | ₦9,910,000 | ₦6,937,000 |
| 26 | ₦10,000,000 | ₦7,000,000 |

The steps are ₦50,000, then ₦100,000, ₦250,000, ₦500,000, settling at
₦500,000 a character. The schedule is built so the 26-character ceiling lands
exactly on **₦10,000,000** — the largest single transfer Paystack will make.


Rounding on the split goes to the platform, so the advertised reward is never a
kobo short of what a winner is actually paid.

### Who gets what

| Stream | Contributor | Spendbox |
| --- | --- | --- |
| Power-up bought against a contributor's box | 70% | 30% |
| Lives bought while hunting a contributor's box | 70% | 30% |
| Bonus lives from an invite | — | — |
| Anything bought against the public box | — | 100% |
| Lives bought from `/me`, with no box in front of them | — | 100% |
| Funding a contributor's box | becomes the reward (70%) | 30% |

A life is nominally attached to no box — buy one anywhere and it works
everywhere. But the *decision* to buy one almost always is attached to a box:
somebody is three characters from cracking a particular safe and won't wait an
hour for the next guess. So the box that was on screen rides along with the
purchase and its contributor takes 70%, exactly as on a power-up. With no box,
and on the platform's own box, the whole thing stays here.

A contributor's share is real money rather than a line in a report: their bank
account is registered with Paystack as a **subaccount**, and every power-up
sale — and every life sold with their box on screen — is charged against it.
Paystack splits at settlement, so their share never sits in a Spendbox balance
waiting for someone to move it, and nobody here moves it by hand.

The one exception is a **reward**, which can't ride a subaccount — the winner is
a stranger with no account here until the moment they win. So a cracked box
opens a claim, the winner supplies a bank account (checked against the bank
before it's stored, so a mistyped digit is caught while it's still a form), and
an admin sends the transfer from `/admin`.

### A box is finished when it opens

An unlocked box can never be played again. If two players submit the winning
guess in the same instant, a conditional update decides it: exactly one is the
winner, and the other is told they were pipped rather than being promised a
money twice.

---

### Sheets

Everything modal in the game is one `Modal`. It caps itself to the *small*
viewport, pins its header and footer, insets itself for an on-screen keyboard,
and **closes when you swipe it down** — a sheet that arrives from the bottom
edge of a phone has one gesture everybody already knows, and not honouring it
makes the grab handle a lie.

The drag engages only from the top of the sheet's scroll: reading down a long
attempt log and flicking back must scroll, not dismiss. Once engaged it takes
over, which is why the touch listener is non-passive and added by hand —
`preventDefault` is the only thing that stops the browser deciding halfway
through that this was a scroll after all.

---

## The tutorial

Seven cards, once per device, for somebody who has just verified an address and
wants to guess a password. Everything in it is written down elsewhere — in the
FAQ, in How it works, on the shelf — and none of that is read by a new player. A
reference answers the question you already have; this answers the ones you don't
know to ask.

**It ends on the bank details screen**, and that is the whole shape of it. The
moment to ask somebody for an account number is while nothing is at stake — not
in the thirty seconds after a win, when the honest answer to "why do you need my
bank details" is "because you just won ₦700,000", which is exactly what a
phishing screen would say. It deep-links to `/me?tab=account` rather than
dropping them at the safehouse to go and find the right tab.

Nothing in it is a gate: every step has a way past and the whole thing has a
Skip. A tutorial you cannot leave is an advertisement.

---

## Surfaces

| Route | Who | What |
| --- | --- | --- |
| `/` | anyone | Featured safes, swipeable; the safes you have open; the locked and cracked boards behind a session |
| `/b/[slug]` | anyone | A box, played — the vault scene. Server-rendered with the run already in it, because a shared link is how nearly everyone arrives |
| `/me` | a verified player | Lives, invites, attempts, and where a reward has got to. Not an account — there's no password here |
| `/faq` | anyone | Every explanation the game screens deliberately don't give, searchable |
| `/terms`, `/privacy` | anyone | The rules and what's collected, with the figures computed from the same constants the code uses |
| `/signup` | a contributor | Email-first: known address asks for a password, new address emails a code |
| `/dashboard` | a contributor | Boxes, Build, Attempts, Money |
| `/admin` | the platform | The public box, rewards to send, and where the revenue came from |

A player never signs up. They verify an address once — because a reward has to
be sent somewhere — and a signed cookie remembers them for six months.

**Every page resolves the player on the server** and hands it to the provider
as its starting state. It used to start every page as an anonymous stranger and
find out otherwise a round trip later, which on a fast connection is a flash
and on a slow one is a second of being asked to sign in to a page you are
already signed into. The address is in a cookie the server can read; there was
never a reason to ask the browser to go and find out. The cost is that those
pages can't be prerendered, which is the right trade for anything with a life
count on it.

### Still open

A signed-in player used to be shown exactly what a stranger was shown: a wall
of boxes to choose from. But somebody four hundred guesses into a safe is not
choosing — they are coming back, and the only thing they want is the one they
were on.

So a strip of the boxes they have open sits above the board, and it looks
nothing like it. The board's cards are portrait, headed by a reward, and answer
*is this worth starting*. These are landscape, headed by a progress bar, and
answer *how far in am I* — your best score fills it and the best anybody has
managed is a notch on it, so the gap between the two is visible without a
number being read, and the gap is the whole reason to open it again. Same
boxes, opposite question, and the shape is the fastest way to say which one you
are looking at.

Live boxes only, not already won, most recently touched first. A safe somebody
else cracks drops off the list on its own, which needs no sweep: there is
nothing to go back to.

The featured carousel also **peeks**. A full-bleed slide is indistinguishable
from a static hero until somebody happens to drag it, so each card stops just
short of the full width and the next one shows through — the only thing on the
page that says there is more than one.

A featured card is three bands with hairlines between them: **who and what**
(maker, name, description), **the prize** alone on a lit plate in the middle,
and **the terms** — difficulty on one side, the crowd on the other. It was one
column of eight things four pixels apart, which is how it managed to read as
cramped and boring at the same time: nothing was louder than anything else, so
nothing led.

**Every card is exactly the same height**, and that costs more care than it
sounds. Descriptions get a fixed two-line slot whether or not there is one; the
title gets two lines' worth of room; a challenge prints "Challenge" at the same
size a reward prints its figure; and the terms band is `flex-col sm:flex-row`
rather than `flex-wrap`, because wrapping is decided per card — a "Merciless"
badge pushed its counters onto a second line while a "Warm" one didn't, and two
slides of different heights make the carousel jump under your thumb.

Descriptions are truncated everywhere they appear. The full text is in the
**vault sheet** during play, which is most of what that button is for.

And a cracked safe keeps its figure in gold, captioned *won by*. Greying it out
was reading as "there was nothing here" when the opposite is true: somebody was
paid that, which is the most persuasive thing on the wall and the reason the
wall exists.

### The contributor dashboard

Four tabs and no more. **Boxes** is what's up and what each has earned, with a
share button that uses the native share sheet where there is one (on a phone
that means WhatsApp, not a clipboard). **Build** is four cards — the box, the
password, the reward and which safe it wears — each opening a dialog with the
whole of that decision in it and nothing else, and each showing a tick when
it's done. The difficulty, our cut and the likely income update as you fill
them in, so nothing is a surprise at checkout.
**Attempts** is who has been having a go, addresses starred out before they
leave the server, with each hunter's **best score** — the one number that says
whether somebody is idly poking at a safe or three characters from opening it.
It's safe there and nowhere else: the person reading it wrote the password. **Money** is income from power-ups and lives, the split
written out in full, the winners, and the bank account it all settles to.

A box is editable and deletable right up until it is *paid for* — not until it
is created. A draft and a box whose checkout was abandoned are equally unplayed
and both are the contributor's to change or throw away; editing one cancels any
outstanding checkout and drops it back to a draft, so a stale payment can never
publish a password nobody agreed to. Once money has arrived, the password, the
name and the safe are permanent, and the reward is the only thing that moves —
upwards only.

---

## How it looks

Spendbox used to look like a bank: near-black, one metal accent, thin strokes,
everything whispering. That is a fine look for a dashboard and the wrong one
for a thing you play.

The palette is now a violet night lit from above. Gold is still the money
colour and still the loudest thing on screen; four candy accents carry
everything else, and each **owns a meaning** rather than being decorative —
grape for power-ups and anything you pay for, mint for success, berry for lives
and running out, sky for length hints and cool scores. All of it is in
`globals.css` and nothing hard-codes a hex.

Everything physical is chunky: big radii, a bright top highlight on anything
raised, and a hard bottom lip on anything you can press. `btn-chunky` is the
signature control — a slab that compresses by exactly the height of its lip, so
it looks like it meets the surface. The lip is a `box-shadow` rather than a
border so the button's own box never changes size.

### Drawn, not downloaded

Every illustration is SVG built from the primitives in
`src/components/art/ink.tsx`, which exist so the whole set looks like it came
from one hand. Four rules, and breaking any one is what makes an icon set look
like three people made it:

1. **Everything is outlined**, in one ink colour, at a weight that scales with
   the shape rather than staying hairline.
2. **Light comes from above** — a top-left highlight and a bottom shadow on
   every solid, always the same way round.
3. **A gloss on top**: one soft ellipse across the upper third. It is most of
   what makes a flat colour look like an object.
4. **No pure black and no pure white.** The ink is violet-black, so nothing
   punches a hole in the page.

### Boxy

The mascot is a safe with a face, and that choice is the whole character
design: the thing standing between you and the money is also the thing keeping
you company while you try to get it. Not a burglar and not a detective —
everybody here is on the same side of the door, and he is delighted when you
finally beat him.

Six moods, each doing a job on a specific screen: `happy` at rest, `thinking`
while a guess is in flight, `cheer` when a box is cracked, `sad` for an empty
state, `sly` where he knows something you don't, and `dizzy` when something has
gone wrong on our side.

### The power-ups

They were line icons, and they were fine in the way a settings screen is fine —
which is a problem, because they are the only things anybody pays for. Each is
now an object with weight sitting on a coloured badge: a clamped tape measure,
four sorted tiles, a winged stopwatch, a prism splitting one beam into the
three colours the attempt log uses, and a pair of goggles. The colour is how
you tell them apart on a shelf you visit forty times.

The two scans share one drawing — a card with two characters on it and a beam
passing beneath — and differ only by the glyph and the badge colour. That is
deliberate: they are one idea sold twice, and two unrelated pictures for two
identical products is how a shelf becomes unreadable. The beam sits *under*
the glyph rather than across it, because a scan line through the middle of two
characters turns both to mush at the size this is actually looked at, which is
twelve pixels.

---

## The safe

Every box wears one of six safes — Brass, Vault, Midnight, Emerald, Crimson,
Ivory — chosen by whoever put it up. It is decoration and only decoration: no
rule reads it, and it is stored as a single checked column on `boxes`.

It is **drawn, not downloaded**. One SVG takes a palette and renders at any
size, so the thumbnail on a lobby card and the hero filling a play screen are
the same component. A set of GIFs would have been six fixed-size, fixed-palette
files of a few hundred kilobytes each, and none of them could react to
anything.

The six are bright. They started dark and tasteful, and on a lobby of thirty
cards they were thirty dark squares; a player picking a safe is picking a toy,
so the bodies carry the colour and the ink outline does the work the darkness
used to.

It is drawn in layers — cabinet, cavity, contents, door — so opening one is a
matter of moving a single group. The door swings to 108°, past edge-on: at
anything less it is still a wide slab lying across the opening, which reads as
a rendering fault rather than a door, and once it's past 90° you are looking at
its back, so its back is what gets drawn. What you're left with is a lit
interior with the reward still in it, which is what a lobby card shows forever
after somebody wins.

The interior is lit brightly on purpose. At the 64px a lobby card gives it, the
bars and the door's edge are a pixel or two wide and neither survives the
downscale; the only thing that reliably says *opened* at that size is that the
middle of it glows.

Because it's live it reacts: the dial rocks gently at rest and spins while a
guess is in flight. All of the motion is CSS on SVG elements, and all of it is
switched off by the global `prefers-reduced-motion` rule — with every animation
stripped it is still a picture of a safe.

---

## The play screen

A password game is, mechanically, a text field and a number. The play screen is
built on one idea: **the mechanic should be visible as an event.**

A guess either beat your own best or it did not. That is a binary, so it is a
shot that lands or a shot that goes wide — and the safe carries the damage from
every one that landed. Ten hits and it bursts.

So the screen is a **chase, seen from above, running forever**: a car behind a
runaway safe, both travelling, the ground going the other way. Full-bleed, no
header, no container; every control floats on top of it. Top-down because a
chase needs two things moving together and a third moving against them, and from
above you get all three with no horizon to draw. Endless because there is no
level to finish — you are on this safe until it opens.

| Layer | What |
| --- | --- |
| **Verge** | The ground either side, in the terrain's colours. |
| **Road** | A flat surface that does not move — a repeating band across it read as floor tiles rather than tarmac. The speed comes from the markings, the worn tyre strips and the streaks, which are the things that would actually be moving. |
| **Scenery** | Ten props down both verges on staggered loops, so the roadside never repeats visibly. |
| **The safe** | A strongbox on wheels, lid facing you, carrying its damage. |
| **The car** | Behind it, gun on the roof. Headlights at night. |
| **Gunfire** | Muzzle flash, the round, and either an impact ring or a shot drifting wide. |

Five terrains — dunes, forest, tundra, coast, downtown — cycled **in order** on a
22-second timer, crossfading. Random would teleport you between biomes, which
reads as a bug. The hour of the day is one tint over everything, because a
top-down view has no sky to put a sun in.

### Under the button

One thing you press forty times an hour, and three you press occasionally. The
Crack the safe button is full width with the three subtabs — **Attempts**,
**Power-ups**, **Known** — in a row beneath it; they used to be two unlabelled
squares sharing the button's row, which made the primary action compete for
width with them and made an icon alone stand for the shelf where the money is.

**Known** is the one that fixed a real problem. Everything a player had paid to
learn used to sit in a standing panel in the middle of the scene, with chips
beside it for whatever was running — so the moment anybody bought anything, the
game screen grew a stack of prose boxes over the chase. Spending money was
rewarded with the old, pre-scene layout arriving on top of the new one. It is a
sheet now, and the running power-ups are in it with their countdowns, which is
also the only place a clock belongs.

### The rail

Three rows across the top, and nothing on it is captioned — every figure opens
a sheet that says what it is, which is the only moment anybody wants the
sentence. Row one is the prize and the two ways out; row two is your best guess
with the score it earned pinned to the end of it; row three is the crowd.

Two things moved to get there. There were **two trophies** — a percentage on
the stat row and the same percentage on a floating pill — and a player
reasonably read them as two different numbers and went looking for the
difference. There is one now, and it sits on the string it describes, where it
needs no label. And the **difficulty went into the vault sheet**: it is a fact
about the box you read once when you arrive, not a reading you check while you
play, and it was taking rail width from things that are.

### The field

The top ten hunters on a box are ten cars, arranged as the standing: the leader
in the middle of the front row, everybody else filling outward and backward
across six lanes and four rows. Nobody overlaps anybody — a standing you can
read at a glance only works if you can see all of it — and **your car is in it
wherever you are**, painted gold. Tapping one shows a masked address and a
percentage, which is the whole of what one stranger should learn about another
on a screen whose only shared fact is a password neither of them has.

`hunts.best_percent` (0034) is what makes this one query instead of a sort over
every guess ever made against a popular safe, ten times a page load.

The screen also polls for other people's guesses. When the box's attempt count
rises somebody else has taken a shot at the same safe, and the scene fires one —
a chase where only your car ever shoots is not a chase.

### Drops

The two places a player quits a hard box are the same two every time: out of
lives, and a run of guesses that went nowhere. So a crate floats in at those
moments — five cold guesses, or two lives left — carrying one of four things,
and it is gone in ten minutes.

| Gift | What it is |
| --- | --- |
| Free lives | One to three, credited on the spot |
| Free Second Wind | 15 minutes on this box with no lives spent |
| Power-up discount | 20–50% off one named power-up |
| Life discount | 20–50% off your next lives, anywhere |

**One gift every ninety minutes**, of any kind, and the floor is in SQL. It
started at ninety *seconds*, with eight minutes between crates on a calm hunt,
which over an evening is a gift every few minutes — not a gift, weather.

**The rotation is server-side too, and that is the other half of the fix.** The
browser used to name the kind it wanted and cycle the power-ups with a counter
that reset on every page load, so two reloads produced a discount on Length
Lock three times running. `mint_gift` (0036) ranks every candidate — the three
fixed kinds plus one per power-up still worth discounting — by when it was last
put in front of *this player*, oldest first, never-offered first of all, with
`random()` breaking ties only among the ones they have genuinely never seen. A
new player's first gifts are varied; a long-running player's are a strict
cycle. Twelve asks in a row produce twelve different gifts.

The browser's only remaining influence is the shortlist of power-ups still on
sale here, which only it knows and which can only ever narrow what is offered.

**The per-kind caps** survive underneath, and a capped kind simply isn't a
candidate:

| Kind | Cap |
| --- | --- |
| Free lives | at most five *claimed* in 24 hours |
| Free Second Wind | one claimed a week |

The two clocks measure different things on purpose. The ninety-minute floor
counts `created_at`, so a crate somebody ignored still spends it — the limit is
on how often a player is *interrupted*, and an interruption they declined still
happened. The daily cap counts `claimed_at`, because that limit is on how many
lives leave the building.

A discount is a row that the checkout reads (`discount_for` for a power-up,
`life_discount_for` for lives) and burns afterwards, because a discount the
client names is a discount the client can name itself. **Its ten minutes run
from the claim, not from the mint** — a coupon taken at 12:09 out of a window
that opened at 12:00 used to arrive with forty seconds on it, and no way to
tell. The play screen carries it as a chip with the countdown on it, the shelf
strikes through the old price on the one power-up it applies to, and a life
discount rides on `PlayerState` so the lives dialog shows the same price
whether it opens from the game, the header or the profile. A discount visible
in one place and invisible in another is somebody being charged without being
told.

Free lives never touch a `life_orders` row, so they are invisible to every
payout: nothing was sold, and nobody's 70% is computed from them. Discounts
are the reverse — the split is taken from the *discounted* price, so a
contributor's share follows the discount down rather than being paid on a
number the player never paid.

### Damage

Ten crack paths are drawn into the lid, revealed one per ten points of **best**
score — not your last, because the safe does not heal when you try something
worse. Each draws itself in rather than fading up: a crack that fades is a
texture, a crack that *travels* is something that just happened.

A hit shakes the scene. A miss travels the same distance at the same speed and
drifts past — same timing on purpose, because a visibly slower miss would be
telling you the answer before it lands.

**Nothing about the animation gates the answer.** The result sheet and the shot
go up in the same tick; somebody firing off guesses never waits for a bullet.

### The mascot's ten turns

The guess dialog carries Boxy on its lip, doing one of ten short turns picked at
random each time it opens — a spin, a hop, a peek, a tumble. The two seconds
between deciding to guess and typing it were dead. Nobody will notice which one
they got; everybody will notice it is never the same twice.

### The result

The score counts up rather than appearing (a number that climbs to 61 feels like
a result; a number that is simply 61 feels like a field), Boxy reacts, and
beating your own best is called out — on a box that takes two thousand attempts
that is the only progress there is.

| | When | What |
| --- | --- | --- |
| **The card** | every ordinary guess | Sits over the bottom of the scene, dims nothing, takes itself away after 2.6 seconds. The dock fades while it is up so the two never fight for the corner. |
| **The dialog** | once per box, on a win | The whole screen, a spark ring, and a button that says *Collect it*. |

The card can be switched off from its own close button, remembered in
`localStorage`.

Nothing counts attempts at you. The per-attempt ordinal is gone from the log and
its dialog, and the dock has a dot rather than a total: "attempt 314" measures
how long you have been stuck, not anything you can act on.

### The number to beat

`boxes.best_percent` is the highest score anybody has reached on a box. It
could have been a query — `attempts` joined through `hunts`, ordered by score —
but that is two hops and a sort over every guess ever made against a popular
safe, for one number, on a screen that reloads after every attempt. So it is a
column, moved forward by `spend_attempt` with `greatest`, which makes it
monotonic: it can only go up, which is what "the best so far" means and what
stops a concurrent guess lowering it.

It is not personal data. It says a stranger once reached 62% on this password;
it does not say who, when, or with what.

---

## Security model

- **`boxes.secret` is service-role only.** No RLS policy anywhere grants a
  select on `boxes` — not to anon, not to a signed-in user, not to the
  contributor who wrote the password. The play surface only ever talks to route
  handlers.
- **Players have no table access at all.** Identity is a signed HMAC cookie
  carrying the address and an expiry, minted after a 6-digit code. Nothing
  about the player is stored client-side that the server would have to trust.
- **Contributors read only their own rows** — their profile and their own
  power-up income. Every write goes through a route handler using the service
  role.
- **The privileged functions are unreachable from a browser.** `start_run`,
  `claim_box`, `credit_lives`, `ensure_player`, `sync_lives` and
  `auth_user_id_by_email` all run `security definer`, so `EXECUTE` is revoked
  from `public` as well as `anon` and `authenticated` — Postgres grants
  `EXECUTE` to `PUBLIC` by default and the API roles inherit it, so naming only
  those two would leave `/rpc/credit_lives` wide open.
- **Concurrency is decided in the database.** One active run per player per box
  (partial unique index), one guess per ordinal (unique constraint — two racing
  submissions claim the same ordinal and exactly one wins), one winner per box
  (conditional update), one live public box (partial unique index).
- **Payment settlement is idempotent.** The webhook and the browser's return
  trip both settle; whichever arrives first does the work, and each order flips
  status with a conditional update that everything downstream hangs off.
- **Emails are masked before they leave the server**, never in the browser.
  Around 70% is starred out and the runs of stars are a fixed width, so the
  mask leaks neither the characters nor how many there were.

---

## Stack

Next.js 16 (App Router, Turbopack), React 19, Tailwind v4, Supabase (Postgres +
Auth), Paystack, Resend.

Session refresh runs in `src/proxy.ts` — Next 16 renamed `middleware` to
`proxy`, and it is matched only on `/dashboard` and `/api/contributor`, since a
player has no Supabase session to refresh.

### Project layout

```
src/lib/constants.ts        the alphabet, lengths, life economy
src/lib/game/feedback.ts    scoring a guess (pure, server-only)
src/lib/game/rewards.ts     the funding ladder and the 70/30 split
src/lib/game/difficulty.ts  the tiers, and the model behind them
src/lib/game/power-ups.ts   the catalogue, availability, and effects
src/lib/game/revenue.ts     what a box is likely to earn, per 1,000 hunters
src/lib/game/designs.ts     the six safes a contributor can pick from
src/lib/faq.ts              every answer, computed from the same constants
src/lib/game/boxes.ts       reading boxes without reading passwords
src/lib/game/view.ts        assembling what the play screen sees
src/lib/game/settle.ts      turning a confirmed payment into the thing it bought
src/app/api/boxes/…         play: the box, the run, the guess, the power-up
src/app/api/player/…        lives, verification, history, drops, reward claims
src/components/in-play.tsx  the safes you have open, above the board
src/app/api/contributor/…   profile, boxes, funding, attempts, earnings, payout
src/app/api/admin/…         the public box, reward claims, revenue
src/components/art/         the house style, Boxy, and the power-up objects
src/components/safe/        the play screen: the chase, the field, the drops
                            and the sheets behind the dock
supabase/migrations/        append-only; 0024 rebuilt it, 0025 made it hard,
                            0027 made a score a percentage, 0028 added
                            Second Wind, the life split and box designs,
                            0029–0030 added invites, 0031 gave players
                            passwords and bank details, 0032 made featuring
                            possible and merged the two identities into one,
                            0033 keeps each box's high-water score, 0034 each
                            hunt's, and adds drops, 0035 caps them and starts
                            a discount's clock when it is claimed, 0036 moves
                            the whole gift rotation into Postgres, 0037 makes
                            the life ceiling a column Life Bank can raise, 0038
                            adds the contributor payout ledger, 0039 makes
                            prices editable and Life Bank weekly
```

---

## Setup

1. **Create a Supabase project**, then apply migrations:

   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push          # applies supabase/migrations/*
   ```

   End every new migration with `notify pgrst, 'reload schema';`, the way 0032
   does. PostgREST answers from a cached picture of the schema and does
   not notice DDL on its own: a migration that adds a column or a view lands in
   Postgres and then the API keeps insisting it isn't there — `PGRST204` for a
   column, `PGRST205` for a table or view. The `NOTIFY` is the whole fix, and
   it's safe to run by hand against a database that has drifted.

   Local stack instead: `npx supabase start && npx supabase db reset`. That also
   runs `supabase/seed.sql`, which creates a contributor
   (`seed@example.com` / `password123`), the public box `/b/the-opening-night`
   (password `oPen`) and a funded box `/b/adas-safe` (password `Na1ra!`).
   Case matters, so those are exact.

2. **Configure env** — copy `.env.example` to `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY` — required.
   - `RESEND_API_KEY` + `EMAIL_FROM` — real emails (otherwise logged to the
     console, which is enough to play locally).
   - `PAYSTACK_SECRET_KEY` — enables funding, power-ups and buying lives. Without
     it the game still works; only the paid parts are switched off.
   - `ADMIN_EMAIL` + `ADMIN_PASSWORD` (and/or `ADMIN_EMAILS`) — access `/admin`.
   - `PLAYER_SESSION_SECRET` — signs the player cookie. Falls back to the
     service-role key.
   - `APP_URL` — canonical URL for Paystack callbacks behind a proxy.

3. **Run**:

   ```bash
   npm install
   npm run dev
   ```

Point Paystack's webhook at `https://your-domain/api/paystack/webhook`.

---

## Testing the rules

**The TypeScript half** — the funding ladder, the split, the difficulty model,
power-up effects and availability — is checked by transpiling `src/lib/game/*`
and asserting against hand-worked cases: that the ladder is monotonic and lands
on ₦10,000,000 at 26 characters, that a split always reconciles to the funding,
that X-Ray never names a character the password doesn't use, that a greyed-out
power-up is never decided by the password.

**A solver** plays the game. It implements the only strategy the feedback
permits — binary-search the length, then walk the positions — against the real
scoring rule, and reports the median attempts per length over 15 random
passwords, in both free-play and Colour Read modes. It cracks 15/15 at every
length in both, and puts every length inside the intended 50–5000 band. See the
difficulty table for how the printed estimate compares.

**The SQL half** runs against a scratch Postgres with stand-ins for the
Supabase-managed `auth` and `storage` schemas, including the `protect_delete`
trigger. Applying every migration in order proves the chain still builds from
nothing; then the checks cover scoring (positional only, case-sensitive,
mismatched lengths, empty guesses, repeated characters), the life economy
(whole-hour accrual, polling not resetting the clock, bought lives exceeding
the cap), the attempt lifecycle (a life per guess, refused guesses costing
nothing, a win closing the box and opening the claim, wrong case *not* winning),
raising a reward (never down, never level, the split still reconciling), and the
constraints. A separate pass sets `role` to `anon` and `authenticated` and
asserts that neither can read a password or call a privileged function.

---

## Paying

Two methods, and they are different Paystack products rather than two buttons
onto one:

| | Where the form lives | Why |
| --- | --- | --- |
| **Bank transfer** | Ours | A one-time account number is just text. Nothing sensitive passes through the page, so it is drawn in the game's own style. |
| **Card** | Paystack's iframe | A card form we drew would put raw card numbers in our own DOM and pull the whole application into PCI DSS SAQ D. Paystack has no tokenising field SDK to borrow instead. |

Transfer is the default and is offered first, because it is the path that never
leaves the game.

Both are started server-side by `startCheckout` — `/transaction/initialize` for
a card, `/charge` with `bank_transfer` for a transfer — so **only the secret key
exists** and no public key is ever handed to a browser. Both write the same
reference onto the same order row, which is what lets `orderTableFor`, the
webhook, the verify route and settlement stay ignorant of which was used. A
player who opens the card form, thinks better of it and transfers instead
cannot end up with two of anything.

The transfer sheet polls `/api/payments/verify` every four seconds, and only
`"paid"` counts. Everything else that route returns is either an in-flight
Paystack status or a terminal failure, and treating any non-pending string as
success would credit a purchase the moment somebody abandoned one. The poll is
the impatient path, not the reliable one: the webhook credits the order whether
or not the tab is still open.

## On the list

### The table

Everyone hunting one safe is doing it alone, and that is the largest thing
missing from the game. Somebody four hundred guesses in has learned things
about a password nobody else knows, and the only channel any of it has to
another player is the scoreboard.

**One room per box, anonymous.** No names, no history, nothing that follows
anybody to the next safe — what you say should read as a theory rather than a
signature, and a handle would turn the room into a reputation game played
alongside the real one.

The button is already in the rail, next to Active boosters, and it opens a
`ComingSoonDialog` with a live countdown to `TABLE_OPENS` in
`src/components/safe/coming-soon.tsx` — **2026-11-06**, three months from the
day it went in. The date is a constant on purpose: "three months from now"
resets every time somebody opens the page and would read as three months away
forever. Move it when the work moves, deliberately, and know that the countdown
is checkable by anybody.

What it will need, from a read of what is already there:

- Messages per box, with a retention window — a room that keeps everything is a
  room that has to be moderated forever.
- Rate limiting per player, reusing `rate-limit.ts`.
- A report path. `/api/report` already exists and already escapes free text on
  the way into an inbox; a message report can go the same way.
- Anonymity that is real on the server, not just unlabelled in the browser: the
  player id must not travel with the message to other clients.
- Somewhere for the abuse case to land. The one thing a chat room reliably
  attracts is the password being posted the moment somebody cracks it — which
  is harmless, because the box closes at that instant, but the room should
  probably say so rather than look broken.

### Chase themes

The chase is one scene — a car pursuing a runaway safe down a road — and it is
the same scene on every box in the game. It should be a **choice the author
makes**, set before the box is created and fixed with it, the way `design`
already fixes the safe's colours.

Five themes, each a complete restaging of the same three moving parts (the
field, the thing being chased, the ground going the other way):

| Theme | The field | What they're chasing | The world |
| --- | --- | --- | --- |
| **Space** | Spacecraft | A capital ship built like a safe | Planets off to the side, asteroids, drifting debris |
| **Air Force** | Fighters | A transport | City, ocean, cloud decks — needs real perspective, not top-down |
| **Boats** | Ships | An aircraft carrier | Open ocean, swell, wake, islands |
| **Police** | Squad cars | A bullion van | The existing road world, restaged |
| **Hunters** | Hunters | A dinosaur | Forest, plain, mountains |

Requirements captured from the brief, so they don't get lost:

- **Author picks it.** A selector in `/admin` and in the contributor's build
  flow, alongside the safe design, before the box exists.
- **The selector animates.** Picking a theme plays the actual scene, so an
  author sees what they are choosing rather than reading its name.
- **Backgrounds carry the theme.** Dynamic, layered, with mountains and horizon
  where the theme has them — the current verge/road/scenery split is one
  biome's worth of that idea and will need generalising.
- **Mascots follow the theme.** Boxy re-costumed per theme, on the front page,
  the loading screen and the cracking screen. Deliberately *not* started in the
  pass that wrote this entry: hand-drawn SVG characters at the current Boxy's
  standard are a serious piece of art work, and half-done mascots would be
  worse than the one good one we have.

What it touches, from a read of the current code:

- `chase-scene.tsx` is ~880 lines built around a single metaphor. The layers
  (verge, road, scenery, streaks, target, field, gunfire) are the right seams,
  but they are hardcoded to tarmac and trees; they need to become theme data.
- `.chase-flat` lays the whole scene on its side from `lg`, so any new art has
  to read in both orientations. The Air Force theme is the one that genuinely
  breaks the top-down frame and needs its own camera.
- `GRID` in `chase-scene.tsx` must stay a mirror about x=50 — see the note on
  it there, and the bug that note exists because of.
- A `theme` column on `boxes` with a default, mirroring how `design` works, plus
  the usual `notify pgrst`.

## Not in this version (deliberately)

- **No leaderboards.** A box has one winner and then it's over.
- **No streaks and no daily bonus.** Lives refill on a clock, and the only
  other way to earn them is inviting somebody who then buys their own.
- **No automated reward transfers.** A winner's bank details are checked with
  the bank, but the transfer itself is a human pressing a button in `/admin`.
- **No cap on attempts.** Play as fast as you can afford to.
- **No editing a funded box.** A draft is yours to change or throw away. The
  moment money goes behind it the password is fixed for good, the box can never
  be deleted, and the reward can only be raised — never lowered.
- **No password recovery for a box.** Nobody at Spendbox can read a box's
  password back to its author, which is the same property that makes the game
  worth playing.
