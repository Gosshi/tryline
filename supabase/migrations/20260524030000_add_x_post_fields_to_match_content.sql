ALTER TABLE match_content
  ADD COLUMN IF NOT EXISTS x_tweet_id text,
  ADD COLUMN IF NOT EXISTS x_posted_at timestamptz;