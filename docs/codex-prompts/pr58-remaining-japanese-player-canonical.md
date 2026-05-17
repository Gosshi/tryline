# PR58: 残り日本人選手の canonical リンク設定

## 背景

PR55 の残課題として列挙された 8 選手について、DB 照合と追加調査で状況が判明した。
5 件は既存の canonical エントリが DB に存在し、すぐにリンクできる。
3 件は canonical エントリ自体が未作成のため、INSERT → UPDATE の順で対応する。

## スコープ

対象:
- `supabase/migrations/` に新規マイグレーション 1 本を追加

対象外:
- position データの補完（別 PR）

---

## Part A: 既存 canonical エントリへのリンク（5件）

DB で照合済み。slug サブクエリで実 UUID を引くため uuid 仮置き不要。

```sql
-- 江良颯 → hayate-era (Japan, id: 097d888d-3cc1-4f3a-9044-7b9f74c9b519)
UPDATE players
SET canonical_player_id = '097d888d-3cc1-4f3a-9044-7b9f74c9b519'
WHERE id = (SELECT id FROM players WHERE slug = 'player-8096a8bb');

-- 堀越康介 → kosuke-horikoshi-2 (Japan, id: fadb51a7-9d07-4fb1-9145-f0a6fd0b2d43)
UPDATE players
SET canonical_player_id = 'fadb51a7-9d07-4fb1-9145-f0a6fd0b2d43'
WHERE id = (SELECT id FROM players WHERE slug = 'player-83f3c0df');

-- 箸本龍雅 → ryuga-hashimoto (東京サントリー, id: 4b903d73-a8a9-42d9-8bc3-eec4cdf67409)
UPDATE players
SET canonical_player_id = '4b903d73-a8a9-42d9-8bc3-eec4cdf67409'
WHERE id = (SELECT id FROM players WHERE slug = 'player-f266b656');

-- 青木恵斗 → keito-aoki (トヨタヴェルブリッツ, id: 42a9c35b-caf1-4045-ae0e-5ee8813518b2)
UPDATE players
SET canonical_player_id = '42a9c35b-caf1-4045-ae0e-5ee8813518b2'
WHERE id = (SELECT id FROM players WHERE slug = 'player-41e5e42b');

-- 福井翔大 → shota-fukui (埼玉パナソニック, id: 2dccee4a-285d-416b-a54c-994654216653)
UPDATE players
SET canonical_player_id = '2dccee4a-285d-416b-a54c-994654216653'
WHERE id = (SELECT id FROM players WHERE slug = 'player-a2b74ef4');
```

---

## Part B: 新規 canonical エントリ作成（3件）

以下 3 選手は canonical エントリが DB に存在しない。
INSERT で canonical エントリを作成してから UPDATE でリンクする。

Japan チーム id: `b2445801-dbe9-4914-b345-564b553a39b2`

### 具智元（Gu Chimon）

```sql
INSERT INTO players (name, slug, team_id)
VALUES ('Gu Chimon', 'gu-chimon', 'b2445801-dbe9-4914-b345-564b553a39b2')
ON CONFLICT (slug) DO NOTHING;

UPDATE players
SET canonical_player_id = (SELECT id FROM players WHERE slug = 'gu-chimon')
WHERE id = (SELECT id FROM players WHERE slug = 'player-138adfc9');
```

### 山沢拓也（Takuya Yamazawa）

```sql
INSERT INTO players (name, slug, team_id)
VALUES ('Takuya Yamazawa', 'takuya-yamazawa', 'b2445801-dbe9-4914-b345-564b553a39b2')
ON CONFLICT (slug) DO NOTHING;

UPDATE players
SET canonical_player_id = (SELECT id FROM players WHERE slug = 'takuya-yamazawa')
WHERE id = (SELECT id FROM players WHERE slug = 'player-a11bb3d6');
```

### 立川理道（Harumichi Tatekawa）

```sql
INSERT INTO players (name, slug, team_id)
VALUES ('Harumichi Tatekawa', 'harumichi-tatekawa', 'b2445801-dbe9-4914-b345-564b553a39b2')
ON CONFLICT (slug) DO NOTHING;

UPDATE players
SET canonical_player_id = (SELECT id FROM players WHERE slug = 'harumichi-tatekawa')
WHERE id = (SELECT id FROM players WHERE slug = 'player-a8ae1d36');
```

---

## 受け入れ条件

- Part A の 5 件について `canonical_player_id` が設定される
- `/players/player-8096a8bb`（江良颯）→ `/players/hayate-era` にリダイレクト
- `/players/player-83f3c0df`（堀越康介）→ `/players/kosuke-horikoshi-2` にリダイレクト
- 立川理道（Harumichi Tatekawa）も新規エントリ作成 + リンク済み
- `pnpm build` でエラーなし

## マイグレーションファイル名

`supabase/migrations/<timestamp>_backfill_remaining_japanese_canonical.sql`
タイムスタンプは `supabase/migrations/` 内の既存ファイルより新しい値にすること。

## 参考

- `docs/codex-prompts/pr55-japanese-national-canonical.md` — 実装パターン参照
- `docs/codex-prompts/pr56-katakana-foreign-canonical.md` — slug サブクエリパターン参照
