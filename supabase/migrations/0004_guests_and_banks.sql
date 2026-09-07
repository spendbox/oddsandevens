-- ============================================================================
-- Playing without an account, verified bank details, and one box at a time.
--
-- Run this after 0003_functions.sql, on a database that already has the first
-- three files. It is safe to run twice.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Playing with nothing but an email.
--
-- Somebody who taps a shared link should be playing in seconds, not filling in
-- a form. So an email alone opens a real, tracked account — the same profile,
-- the same wallet, the same history as anyone else's. What they do not have yet
-- is a password.
--
-- `password_set` is what makes that safe to reverse. While it is false, an
-- email is enough to get back in. The moment somebody sets a password — which
-- claiming a prize requires — email-only entry stops working for that account
-- and the password is the only way in. An account with money in it is never
-- reachable by typing somebody else's address.
-- ---------------------------------------------------------------------------
-- Added defaulting to true, then the default is flipped to false. That gives
-- the right answer on both sides in one step: everyone who already had an
-- account made it with a password, and everyone arriving from now on has not.
--
-- Deliberately not "add the column, then UPDATE the false ones to true" — that
-- reads fine and is a trap, because running this file a second time would sweep
-- up every real guest account and lock them out of the email-only door.
alter table public.profiles
  add column if not exists password_set boolean not null default true;

alter table public.profiles
  alter column password_set set default false;

-- ---------------------------------------------------------------------------
-- Bank details, as Paystack confirmed them.
--
-- `bank_code` is Paystack's code for the bank, and `account_name` is no longer
-- something the player types: it comes back from Paystack's name enquiry
-- against NIBSS. A payout can then only ever go to an account that exists and
-- whose name the bank itself gave us.
--
-- `account_verified_at` records when that check passed. It is cleared whenever
-- the number or the bank changes, so an unverified account cannot be paid.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists bank_code text not null default '';

alter table public.profiles
  add column if not exists account_verified_at timestamptz;

-- ---------------------------------------------------------------------------
-- One open box per person.
--
-- A creator with five boxes out at once is five ways to be owed ₦100,000 while
-- having paid nothing. One at a time keeps a box worth paying attention to, and
-- keeps the platform's exposure to one box per person.
--
-- A partial unique index rather than a check in the app: two "create box" taps
-- arriving together are a race the database wins, and the app never has to.
-- ---------------------------------------------------------------------------
create unique index if not exists boxes_one_open_per_creator
  on public.boxes (creator_id)
  where status = 'open';

-- ---------------------------------------------------------------------------
-- Widen the profiles guard to every column the server owns.
--
-- 0002 stopped a browser changing its own coin balance. These new columns need
-- the same protection and for a sharper reason: `account_verified_at` is a
-- claim that Paystack confirmed this account exists, and the payout queue
-- treats it as one. A player who could set it themselves could send ₦100,000
-- to any account number they liked, verified by nobody.
--
-- `password_set` is here too. It is what decides whether an email alone opens
-- this account, so flipping it back to false is a way to reopen a locked
-- account — and flipping it to true is a way to lock somebody else out.
--
-- What stays editable by the person: their display name. That is the whole
-- list, and it is the only field on this table that is genuinely theirs to say.
-- ---------------------------------------------------------------------------
create or replace function public.guard_coin_balance()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  claims text := current_setting('request.jwt.claims', true);
begin
  -- No claims at all means this is not a request from a browser: the SQL
  -- editor, a migration, a psql session. Those are already trusted.
  if claims is null or claims = '' then return new; end if;
  if (claims::jsonb ->> 'role') = 'service_role' then return new; end if;

  if new.coins               is distinct from old.coins
     or new.password_set     is distinct from old.password_set
     or new.account_verified_at is distinct from old.account_verified_at
     or new.account_name     is distinct from old.account_name
     or new.account_number   is distinct from old.account_number
     or new.bank_code        is distinct from old.bank_code
     or new.bank_name        is distinct from old.bank_name
     or new.email            is distinct from old.email
  then
    raise exception
      'only Spendbox itself can change your balance, password or bank details';
  end if;

  return new;
end;
$$;
