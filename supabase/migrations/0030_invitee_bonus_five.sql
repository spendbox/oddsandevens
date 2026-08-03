-- The invited player's bonus goes from three lives to five.
--
-- An invite is now symmetrical: whoever brought you and whoever you are both
-- get five free lives on their next paid top-up. Buy ten lives on somebody's
-- link and you leave with fifteen.
--
-- Only the constant moves. `settle_life_purchase` reads it at call time, so
-- nothing else has to change and nothing already banked is disturbed — a
-- player sitting on three lives from an earlier referral keeps their three,
-- and every referral qualified from now on is worth five.

create or replace function public.invitee_bonus_lives() returns int
  language sql immutable as $$ select 5 $$;

-- CREATE OR REPLACE hands EXECUTE back to PUBLIC every time, and anon and
-- authenticated inherit from it. Take it away again.
revoke execute on function public.invitee_bonus_lives()
from public, anon, authenticated;
