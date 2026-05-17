-- canonical_player_id を追加（NULL = このレコード自体が canonical）
ALTER TABLE players
  ADD COLUMN canonical_player_id uuid REFERENCES players(id) ON DELETE SET NULL;

-- 同名選手のうち match_lineups 出場数が最多のものを canonical に選出し、
-- 残りに canonical_player_id をセット
WITH ranked AS (
  SELECT
    p.id,
    p.name,
    COUNT(ml.id) AS lineup_count,
    ROW_NUMBER() OVER (
      PARTITION BY p.name
      ORDER BY COUNT(ml.id) DESC, p.created_at ASC
    ) AS rn
  FROM players p
  LEFT JOIN match_lineups ml ON ml.player_id = p.id
  GROUP BY p.id, p.name
),
dupes AS (
  SELECT name FROM ranked GROUP BY name HAVING COUNT(*) > 1
),
canonical_ids AS (
  SELECT id AS canonical_id, name
  FROM ranked
  WHERE rn = 1 AND name IN (SELECT name FROM dupes)
)
UPDATE players p
SET canonical_player_id = c.canonical_id
FROM canonical_ids c
WHERE p.name = c.name
  AND p.id != c.canonical_id;

-- canonical の slug は既存のまま維持
-- 非 canonical の slug は変更不要（リダイレクト元として使うため）
