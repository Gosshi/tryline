ALTER TABLE players ADD COLUMN IF NOT EXISTS slug text;

-- ASCII文字を含む名前はケバブケース、含まない（日本語等）はUUIDベース
UPDATE players
SET slug = CASE
  WHEN regexp_replace(lower(name), '[^a-z0-9]+', '', 'g') != ''
  THEN regexp_replace(
    regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'),
    '^-+|-+$', '', 'g'
  )
  ELSE 'player-' || substr(id::text, 1, 8)
END;

-- 重複をrow_numberで解決（2人目以降に -2, -3 を付与）
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY id) AS rn
  FROM players
)
UPDATE players p
SET slug = p.slug || '-' || r.rn::text
FROM ranked r
WHERE p.id = r.id AND r.rn > 1;

ALTER TABLE players ALTER COLUMN slug SET NOT NULL;
ALTER TABLE players ADD CONSTRAINT players_slug_key UNIQUE (slug);
