-- ============================================================================
-- Beating your own box, and the numbers the front page shows.
--
-- Run this after 0006_retries_and_box_art.sql. Safe to run twice.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- claim_win — one prize when the creator beats their own box.
--
-- A box normally pays twice: once to whoever made it, once to whoever beat it.
-- When those are the same person, paying both halves would hand them ₦200,000
-- for a box they made themselves, which is not a game — it is a way to print
-- money by beating your own patterns and would be the first thing anybody
-- tried. So a self-win pays the prize exactly once.
--
-- Everything else about it is unchanged: it is still the WHERE clause that
-- decides who was first, still one transaction, and the (box_id, role) unique
-- constraint still stops a second run paying anything again.
-- ---------------------------------------------------------------------------
create or replace function public.claim_win(
  p_box   uuid,
  p_user  uuid,
  p_name  text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prize   integer;
  v_creator uuid;
  v_code    text;
begin
  update public.boxes
     set status      = 'won',
         winner_id   = p_user,
         winner_name = p_name,
         won_at      = now()
   where id = p_box
     and status = 'open'
     and winner_id is null
  returning prize_naira, creator_id, code into v_prize, v_creator, v_code;

  if v_prize is null then
    return false;
  end if;

  if v_creator = p_user then
    -- Their own box. One prize, recorded as the winner's side, because that is
    -- the half they earned by playing.
    insert into public.payouts (box_id, user_id, role, amount_naira, note)
    values (p_box, p_user, 'winner', v_prize, 'Beat your own box ' || v_code)
    on conflict (box_id, role) do nothing;
  else
    insert into public.payouts (box_id, user_id, role, amount_naira, note)
    values
      (p_box, v_creator, 'creator', v_prize, 'Box ' || v_code || ' was beaten'),
      (p_box, p_user,    'winner',  v_prize, 'Beat box ' || v_code)
    on conflict (box_id, role) do nothing;
  end if;

  return true;
end;
$$;

revoke all on function public.claim_win(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_win(uuid, uuid, text) to service_role;
