-- An invite pays the moment it is used.
--
-- The old terms were three rules deep: the invited player had to buy ten lives
-- or more, the bonus was banked rather than credited, and it only landed on a
-- *later* paid top-up. Every one of those was defensible on its own and
-- together they made a feature nobody could state in a sentence — the panel
-- needed a paragraph, the FAQ needed four entries, and the reward arrived so
-- far from the act that earned it that it stopped reading as a reward at all.
--
-- The terms are now one line: **somebody joins on your link, you both get three
-- lives, immediately.** No purchase, nothing banked, nothing to come back for.
--
-- What is deliberately kept from the old design:
--
--   * a player can never be their own inviter (a check constraint from 0029);
--   * an inviter is attached once and never changed, which is also what stops
--     the lives below being paid twice — the credit hangs off the `UPDATE …
--     where invited_by is null` affecting a row, not off a separate flag;
--   * the inviter's side stacks without limit. Ten friends is thirty lives.
--
-- What this gives up is the paywall that used to sit in front of the bonus.
-- Under the old rules farming yourself lives cost ₦1,500 of real money per
-- throwaway address; now it costs an inbox, and two addresses is six lives.
-- That is the price of terms a player can hold in their head, and the brakes
-- on it are the ones already built: one account per person in the terms,
-- `signup_ip_hash` (0043) recording where accounts are born, and lives being
-- worth guesses rather than money. If it is ever abused at scale, the lever is
-- `referral_bonus_lives()` — one constant, read at call time.
--
-- Bonus lives are still free lives: never charged, so they never enter a price
-- and never see the 70/30 split.

-- ---------------------------------------------------------------------------
-- Terms: one number, for both sides
-- ---------------------------------------------------------------------------

create or replace function public.referral_bonus_lives() returns int
  language sql immutable as $$ select 3 $$;

-- ---------------------------------------------------------------------------
-- Claiming an invite, which is now also the payout
-- ---------------------------------------------------------------------------

/*
 * Attach an inviter to a player, once and for ever, and pay both sides.
 *
 * Every failure is silent and answers `claimed: false`: a code that doesn't
 * exist, your own code, a player who already has an inviter. The caller is a
 * browser replaying a link it found in localStorage, and none of those are
 * worth an error — they're the normal case on the second visit.
 *
 * `sync_lives` runs before each credit so the accrual clock is brought up to
 * date first; the bonus then sits *on top* of the pool the same way a bought
 * life does, above the ceiling if that's where it lands. Crediting without the
 * sync would silently swallow whatever had accrued since the player was last
 * seen.
 *
 * The return type changed from boolean in 0029: the browser shows what landed.
 */
drop function if exists public.claim_invite(uuid, text);

create function public.claim_invite(p_player_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inviter uuid;
  v_bonus constant int := public.referral_bonus_lives();
  v_lives int;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    return jsonb_build_object('claimed', false);
  end if;

  select id into v_inviter from public.players
   where invite_code = upper(trim(p_code));
  if not found or v_inviter = p_player_id then
    return jsonb_build_object('claimed', false);
  end if;

  -- The one write that decides everything below. A player who already has an
  -- inviter matches no row, so a replayed code pays nobody a second time.
  update public.players
     set invited_by = v_inviter,
         referral_qualified_at = now()
   where id = p_player_id and invited_by is null;
  if not found then
    return jsonb_build_object('claimed', false);
  end if;

  perform public.sync_lives(p_player_id);
  update public.players
     set lives = lives + v_bonus
   where id = p_player_id
   returning lives into v_lives;

  perform public.sync_lives(v_inviter);
  update public.players
     set lives = lives + v_bonus
   where id = v_inviter;

  return jsonb_build_object('claimed', true, 'bonus', v_bonus, 'lives', v_lives);
end;
$$;

-- ---------------------------------------------------------------------------
-- A paid top-up, with the referral machinery taken back out of it
-- ---------------------------------------------------------------------------

/*
 * Credit a paid top-up, and spend anything still banked from the old rules.
 *
 * No purchase qualifies anything any more — that moved to `claim_invite` — so
 * the ordering dance that made one purchase unable to qualify itself is gone
 * with it. What stays is the payout of `bonus_lives_pending`, because players
 * are sitting on balances banked before this migration and those were promised
 * on their next top-up. The column keeps its meaning; nothing adds to it now,
 * and it drains to zero as those players buy.
 *
 * Safe to run twice only because its caller isn't: `settleLives` flips the
 * order to paid with a conditional update and calls this once, on the call
 * that won.
 */
create or replace function public.settle_life_purchase(
  p_player_id uuid,
  p_quantity int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players;
  v_bonus int;
begin
  select * into v_player from public.players where id = p_player_id for update;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'player_not_found');
  end if;

  v_bonus := v_player.bonus_lives_pending;

  perform public.sync_lives(p_player_id);
  update public.players
     set lives = lives + p_quantity + v_bonus,
         bonus_lives_pending = 0
   where id = p_player_id
   returning * into v_player;

  return jsonb_build_object(
    'result', 'credited',
    'quantity', p_quantity,
    'bonus_applied', v_bonus,
    'lives', v_player.lives,
    'referral_qualified', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The old terms, gone
-- ---------------------------------------------------------------------------

-- Nothing calls these now, and leaving a `referral_min_lives()` behind would
-- leave a second answer to "what does an invite cost" for the next person to
-- find. plpgsql resolves names at run time, so nothing above depends on them.
drop function if exists public.referral_min_lives();
drop function if exists public.inviter_bonus_lives();
drop function if exists public.invitee_bonus_lives();

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- `claim_invite` now mints lives directly, which makes reaching it over
-- PostgREST worth three lives a call to anybody who can guess a player id.
-- `public` here is the pseudo-role that anon and authenticated inherit from.
revoke execute on function
  public.claim_invite(uuid, text),
  public.settle_life_purchase(uuid, int),
  public.referral_bonus_lives()
from public, anon, authenticated;

notify pgrst, 'reload schema';
