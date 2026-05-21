ALTER TABLE match_content
  ADD COLUMN IF NOT EXISTS discord_notified_at timestamptz;
