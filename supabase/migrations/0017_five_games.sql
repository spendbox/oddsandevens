-- ---------------------------------------------------------------------------
-- 0017_five_games: two new game types, and room for nothing else.
--
-- The platform is down to five games — whack-a-mole, slice ninja, flappy, a 3D
-- mahjong and a match-3 — chosen because each one produces a score with enough
-- spread to rank a weekly leaderboard honestly. The two new ones need to be
-- allowed by the type constraint before a merchant can create them.
--
-- The retired types stay in the constraint on purpose: rows already in the
-- table reference them, and a business's published game should not become
-- unreadable because the catalogue moved on. They are simply no longer
-- offered, and no new row can be created with one because the application
-- refuses types that aren't in the catalogue.
-- ---------------------------------------------------------------------------

alter table public.games drop constraint if exists games_type_check;

alter table public.games
  add constraint games_type_check check (type in (
    -- The five the builder offers.
    'whack-a-mole',
    'slice-ninja',
    'flappy',
    'mahjong-3d',
    'match-3',
    -- Retired, but still playable where one is already published.
    'spin-wheel',
    'scratch-card',
    'mystery-box',
    'advent-calendar',
    'endless-runner',
    'falling-catcher',
    'tile-merge',
    'recommender-quiz',
    'myth-fact',
    'memory-match',
    'lookbook',
    'leaderboard-trivia',
    'scavenger-hunt',
    'bracket-poll',
    'jigsaw',
    'spot-difference',
    'tic-tac-toe'
  ));
