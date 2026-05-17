# PR42: レビュー（recap）未生成試合のバックフィル

## 背景

以下の試合でレビューが「⏳ 準備中」のまま生成されていない。

| 試合 | matchId |
|------|---------|
| RWC 2023 決勝（NZ v RSA） | `d31077ee-92c6-480e-bbef-87f955e6bc1d` |
| RWC 2023 準決勝・準々決勝・3位決定戦 | 下記 SQL で確認 |
| Autumn Nations（RSA v JPN 等） | `fcdfe588-8b3c-4cda-a8fe-c8df6b988f48`（および同競技の他試合） |
| League One 最新数試合 | `33ddf0dc-4af6-4dbf-ba07-3ee2e51c80c9`（および直近ラウンド） |

### 根本原因

`lib/cron/orchestrate.ts` の `runOrchestrate` は、`finished` 状態でまだ recap のない試合を
すべて取得するが、`RECAP_BATCH_SIZE = 10` で先頭 10 件しか処理しない。
古い試合（RWC 2023 ノックアウト、Autumn Nations 等）は Supabase のデフォルト順で
後ろに押し出され、定常 cron では処理されない可能性がある。

### 追加の問題：match_events（得点推移グラフ）

RWC 2023 決勝・準決勝は得点推移グラフが表示されていない。
`match_events` が 0 件の可能性が高い。
`fill-event-gaps` cron は `external_ids` に `wikipedia_url` があるものしか処理しないため、
RWC ノックアウト試合の `external_ids` 確認が必要。

## スコープ

対象:
- **調査**: 影響試合を SQL で特定
- **バックフィル**: `generate-content` API を直接呼び出して recap を生成
- **イベント修正**: `external_ids.wikipedia_url` が未設定の場合は設定してイベントを取得

対象外:
- `RECAP_BATCH_SIZE` の恒久的な変更（別 PR で検討）
- preview 生成（キックオフが過去のため orchestrate では不可）

## 作業手順

### ステップ 1: 影響試合の特定（診断 SQL）

Supabase ダッシュボードまたはローカル開発環境で実行する。

```sql
-- 1-A: recap がない finished 試合の一覧（競技・シーズン付き）
SELECT
  m.id AS match_id,
  m.kickoff_at,
  c.family,
  c.season,
  ht.name AS home_team,
  at.name AS away_team,
  m.home_score,
  m.away_score
FROM matches m
JOIN competitions c ON m.competition_id = c.id
JOIN teams ht ON m.home_team_id = ht.id
JOIN teams at ON m.away_team_id = at.id
WHERE m.status = 'finished'
  AND NOT EXISTS (
    SELECT 1 FROM match_content mc
    WHERE mc.match_id = m.id
      AND mc.content_type = 'recap'
      AND mc.status IN ('draft', 'published')
  )
ORDER BY c.family, m.kickoff_at DESC;
```

```sql
-- 1-B: match_events がない finished 試合（RWC 2023 ノックアウトに絞る）
SELECT
  m.id AS match_id,
  m.round,
  m.external_ids,
  ht.name AS home_team,
  at.name AS away_team,
  COUNT(me.id) AS event_count
FROM matches m
JOIN competitions c ON m.competition_id = c.id
JOIN teams ht ON m.home_team_id = ht.id
JOIN teams at ON m.away_team_id = at.id
LEFT JOIN match_events me ON me.match_id = m.id
WHERE m.status = 'finished'
  AND c.family = 'rwc'
  AND c.season = '2023'
  AND m.round >= 5
GROUP BY m.id, m.round, m.external_ids, ht.name, at.name
ORDER BY m.round;
```

```sql
-- 1-C: Autumn Nations の recap 未生成試合
SELECT m.id, m.kickoff_at, ht.name AS home_team, at.name AS away_team
FROM matches m
JOIN competitions c ON m.competition_id = c.id
JOIN teams ht ON m.home_team_id = ht.id
JOIN teams at ON m.away_team_id = at.id
WHERE m.status = 'finished'
  AND c.family = 'autumn-nations'
  AND NOT EXISTS (
    SELECT 1 FROM match_content mc
    WHERE mc.match_id = m.id
      AND mc.content_type = 'recap'
      AND mc.status IN ('draft', 'published')
  )
ORDER BY m.kickoff_at DESC;
```

### ステップ 2: match_events 修正（RWC 2023 ノックアウト）

ステップ 1-B の結果で `event_count = 0` かつ `external_ids` に `wikipedia_url` がない試合は、
Wikipedia の個別試合ページ URL を設定する。

**参照先 Wikipedia URL**:
- 決勝: `https://en.wikipedia.org/wiki/2023_Rugby_World_Cup_Final`
- 準決勝: `https://en.wikipedia.org/wiki/2023_Rugby_World_Cup_semi-finals`
- 準々決勝: `https://en.wikipedia.org/wiki/2023_Rugby_World_Cup_quarter-finals`
- 3位決定戦: `https://en.wikipedia.org/wiki/2023_Rugby_World_Cup_third-place_play-off`

各ページの `wikipedia_event_id`（当該試合のセクション ID）を確認して設定する。

```sql
-- 例: RWC 2023 決勝に wikipedia_url を追加
UPDATE matches
SET external_ids = external_ids || jsonb_build_object(
  'wikipedia_url', 'https://en.wikipedia.org/wiki/2023_Rugby_World_Cup_Final'
)
WHERE id = 'd31077ee-92c6-480e-bbef-87f955e6bc1d';
```

設定後、`/api/cron/fill-event-gaps` を手動トリガーまたは Owner に依頼して実行する。

### ステップ 3: recap バックフィル

ステップ 1-A・1-C の結果から match_id のリストを取得し、
`/api/cron/generate-content` を直接呼び出す。

```bash
# 複数 matchId をまとめて recap 生成（Owner が CRON_SECRET を設定して実行）
curl -X POST https://tryline-six.vercel.app/api/cron/generate-content \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "matchIds": [
      "d31077ee-92c6-480e-bbef-87f955e6bc1d",
      "fcdfe588-8b3c-4cda-a8fe-c8df6b988f48",
      "33ddf0dc-4af6-4dbf-ba07-3ee2e51c80c9"
    ],
    "contentType": "recap"
  }'
```

`generate-content` は matchId ごとに内部で重複チェックを行うため、
すでに生成済みの試合を含めても安全。

### ステップ 4（オプション）: 根本原因の恒久対応

`orchestrate.ts` の `recapCandidates` クエリに `ORDER BY kickoff_at DESC` を加えると、
最新試合から処理するようになり、今後のバックフィル漏れを防止できる。
ただし過去の大量未生成試合が残る場合は一括バックフィルが引き続き必要。

これは別 PR で Owner と相談する。

## 受け入れ条件

- RWC 2023 決勝・準決勝・準々決勝・3位決定戦のページでレビューが表示される
- RWC 2023 ノックアウト試合の得点推移グラフが表示される（match_events 取得後）
- Autumn Nations の対象試合ページでレビューが表示される
- League One 最新試合ページでレビューが表示される
- 正常に生成済みのレビューには影響しない

## 参考ファイル

- `app/api/cron/generate-content/route.ts` — recap 生成エンドポイント
- `app/api/cron/fill-event-gaps/route.ts` — match_events バックフィルエンドポイント
- `lib/cron/orchestrate.ts` — 定常パイプライン（`RECAP_BATCH_SIZE = 10`）

## 未解決の質問

- Autumn Nations の `external_ids` に `wikipedia_url` が設定されているか（ステップ 1-A 実行後に判明）
- RWC 2023 準決勝・準々決勝・3位決定戦の match_id（ステップ 1-A 実行後に判明）
- `fill-event-gaps` は Wikipedia の個別ノックアウト試合ページを正しくパースできるか（動作確認が必要）
