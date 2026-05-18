-- 残り日本人選手の canonical_player_id バックフィル

-- 江良颯 → hayate-era
UPDATE players
SET canonical_player_id = '097d888d-3cc1-4f3a-9044-7b9f74c9b519'
WHERE id = (SELECT id FROM players WHERE slug = 'player-8096a8bb');

-- 堀越康介 → kosuke-horikoshi-2
UPDATE players
SET canonical_player_id = 'fadb51a7-9d07-4fb1-9145-f0a6fd0b2d43'
WHERE id = (SELECT id FROM players WHERE slug = 'player-83f3c0df');

-- 箸本龍雅 → ryuga-hashimoto
UPDATE players
SET canonical_player_id = '4b903d73-a8a9-42d9-8bc3-eec4cdf67409'
WHERE id = (SELECT id FROM players WHERE slug = 'player-f266b656');

-- 青木恵斗 → keito-aoki
UPDATE players
SET canonical_player_id = '42a9c35b-caf1-4045-ae0e-5ee8813518b2'
WHERE id = (SELECT id FROM players WHERE slug = 'player-41e5e42b');

-- 福井翔大 → shota-fukui
UPDATE players
SET canonical_player_id = '2dccee4a-285d-416b-a54c-994654216653'
WHERE id = (SELECT id FROM players WHERE slug = 'player-a2b74ef4');

-- 具智元（Gu Chimon）
INSERT INTO players (name, slug, team_id)
SELECT 'Gu Chimon', 'gu-chimon', id
FROM teams
WHERE slug = 'japan'
ON CONFLICT (slug) DO NOTHING;

UPDATE players
SET canonical_player_id = (SELECT id FROM players WHERE slug = 'gu-chimon')
WHERE id = (SELECT id FROM players WHERE slug = 'player-138adfc9');

-- 山沢拓也（Takuya Yamazawa）
INSERT INTO players (name, slug, team_id)
SELECT 'Takuya Yamazawa', 'takuya-yamazawa', id
FROM teams
WHERE slug = 'japan'
ON CONFLICT (slug) DO NOTHING;

UPDATE players
SET canonical_player_id = (SELECT id FROM players WHERE slug = 'takuya-yamazawa')
WHERE id = (SELECT id FROM players WHERE slug = 'player-a11bb3d6');

-- 立川理道（Harumichi Tatekawa）
INSERT INTO players (name, slug, team_id)
SELECT 'Harumichi Tatekawa', 'harumichi-tatekawa', id
FROM teams
WHERE slug = 'japan'
ON CONFLICT (slug) DO NOTHING;

UPDATE players
SET canonical_player_id = (SELECT id FROM players WHERE slug = 'harumichi-tatekawa')
WHERE id = (SELECT id FROM players WHERE slug = 'player-a8ae1d36');
