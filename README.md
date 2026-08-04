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

A password is 3 to 26 characters from the 26 letters (both cases), ten digits
and every symbol on a QWERTY keyboard — 94 in all. Anything you can type is
fair game: `& $ # ) ( ; : ! ? *` and the rest. The one exclusion is the space,
because a password you can't tell the length of by eye shouldn't also be one
you can't tell the *shape* of by eye.

**Case is part of the password.** `k` and `K` are different characters, which
roughly squares the search space and is, with the symbols, why a box takes
hundreds of attempts rather than a dozen.

An attempt answers two things:

| | |
| --- | --- |
| **Length** | Too short, too long, or exactly right. Nothing ever says how long the password is — that's the first thing you have to hunt. |
| **Score** | How close the guess is, as a percentage of a perfect one. |

Every position contributes to the score: an exact character most, the right
letter in the wrong case least, a character that's in the password but sitting
somewhere else in between. **How much each is worth is not published** — not in
the app, not in the API, not in any copy. Two very different guesses can score
the same, and working out which explanation fits is the game.

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
splits every attempt — the ones already made included — into its three parts: exact hits,
right-letter-wrong-case hits, and characters that are in there somewhere else.

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
| Length Lock | 0.25% | Tells you exactly how many characters the password has |
| Case Map | 0.5% | Counts the uppercase, lowercase, digits and symbols — without positions |
| Second Wind | 0.5% | Unlimited guesses on this box for 1 hour. No lives spent at all |
| Colour Read | 1.5% | Splits every score, past and future, into its three parts — for 24 hours |
| X-Ray | 5% | Names half the distinct characters it hasn't named yet, unordered |

**Prices are a share of the box's reward**, floored so that a challenge box
with nothing behind it still has a shelf to sell. A hint that saves you a
fortnight of grinding on a ₦7,000,000 safe is not worth what the same hint is
worth on a ₦7,000 one, and a flat price got that wrong in both directions. The
floors are ₦200 / ₦300 / ₦300 / ₦500 / ₦1,000 in the order above.

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

### Buying one twice

Length Lock and Case Map sell once: the answer is permanent and complete, so a
second sale would be a second copy of the same sentence. Second Wind and Colour
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

## Surfaces

| Route | Who | What |
| --- | --- | --- |
| `/` | anyone | Featured safes, swipeable; the locked and cracked boards behind a session |
| `/b/[slug]` | anyone | A box, played — the vault scene. Server-rendered with the run already in it, because a shared link is how nearly everyone arrives |
| `/me` | a verified player | Lives, invites, attempts, and where a reward has got to. Not an account — there's no password here |
| `/faq` | anyone | Every explanation the game screens deliberately don't give, searchable |
| `/terms`, `/privacy` | anyone | The rules and what's collected, with the figures computed from the same constants the code uses |
| `/signup` | a contributor | Email-first: known address asks for a password, new address emails a code |
| `/dashboard` | a contributor | Boxes, Build, Attempts, Money |
| `/admin` | the platform | The public box, rewards to send, and where the revenue came from |

A player never signs up. They verify an address once — because a reward has to
be sent somewhere — and a signed cookie remembers them for six months.

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
lives, and a run of guesses that went nowhere. So a crate floats in at exactly
those moments — five cold guesses, or two lives left — carrying either free
lives or a share off one power-up, and it is gone in ten minutes.

Rate is a function of trouble rather than a timer: eight minutes apart when a
hunt is going fine, two when it isn't, never closer than ninety seconds.
Discounts cycle through the power-ups, so a long session sees each in turn.

The terms are the server's. The browser notices the moment and asks;
`mint_offer` decides what it gets, caps it at five lives or half price, and
refuses to make a second while the first is unclaimed — a browser that can ask
twice will. A discount is a row that `discount_for` reads at checkout and
`spend_discount` burns afterwards, because a discount the client names is a
discount the client can name itself.

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
src/app/api/player/…        lives, verification, history, reward claims
src/app/api/contributor/…   profile, boxes, funding, attempts, earnings, payout
src/app/api/admin/…         the public box, reward claims, revenue
src/components/art/         the house style, Boxy, and the power-up objects
src/components/safe/        the play screen: the vault scene, the ten locks,
                            the field and the sheets behind the dock
supabase/migrations/        append-only; 0024 rebuilt it, 0025 made it hard,
                            0027 made a score a percentage, 0028 added
                            Second Wind, the life split and box designs,
                            0029–0030 added invites, 0031 gave players
                            passwords and bank details, 0032 made featuring
                            possible and merged the two identities into one,
                            0033 keeps each box's high-water score, 0034 each
                            hunt's, and adds drops
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
