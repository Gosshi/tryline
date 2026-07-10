CREATE TABLE IF NOT EXISTS sample_matches (
  match_id uuid PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
  rank integer NOT NULL CHECK (rank >= 1),
  selected_at timestamptz NOT NULL DEFAULT now(),
  selection_reason text
);

CREATE UNIQUE INDEX IF NOT EXISTS sample_matches_rank_key
  ON sample_matches(rank);

ALTER TABLE sample_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sample_matches_select" ON sample_matches;

CREATE POLICY "sample_matches_select"
  ON sample_matches
  FOR SELECT
  USING (true);
