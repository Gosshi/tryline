ALTER TABLE match_content
  ADD COLUMN language text NOT NULL DEFAULT 'ja'
  CHECK (language IN ('ja', 'en'));

ALTER TABLE match_content
  DROP CONSTRAINT IF EXISTS match_content_match_id_content_type_key;

ALTER TABLE match_content
  ADD CONSTRAINT match_content_match_id_content_type_language_key
  UNIQUE (match_id, content_type, language);
