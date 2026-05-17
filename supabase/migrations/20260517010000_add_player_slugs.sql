ALTER TABLE players ADD COLUMN IF NOT EXISTS slug text;

UPDATE players
SET slug = regexp_replace(
  regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'),
  '^-|-$', '', 'g'
)
WHERE slug IS NULL;

UPDATE players p
SET slug = p.slug || '-' || t.slug
FROM teams t
WHERE p.team_id = t.id
  AND (
    SELECT COUNT(*)
    FROM players p2
    WHERE p2.slug = p.slug
      AND p2.id != p.id
  ) > 1;

ALTER TABLE players
  ALTER COLUMN slug SET NOT NULL,
  ADD CONSTRAINT players_slug_key UNIQUE (slug);
