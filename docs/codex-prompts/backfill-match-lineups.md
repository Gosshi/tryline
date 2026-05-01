# Codex Prompt: backfill-match-lineups

## 目的

Wikipedia の Six Nations 大会ページ（例: `https://en.wikipedia.org/wiki/2025_Six_Nations_Championship`）から全試合のラインアップ（先発 15 + ベンチ 8）を取得し、`match_lineups` テーブルに一括 upsert するバックフィルスクリプトを実装する。

## 背景と制約

- Wikipedia の Six Nations ページには **試合個別ページが存在しない**。大会ページの各 Round セクション内に vevent ブロックとして試合が並んでいる。
- `backfill-match-events.ts` が同じページ構造を使って試合イベントを取得している。**そのスクリプトを設計の手本にすること**。
- `lib/ingestion/sources/wikipedia-six-nations.ts` の `parseWikipediaSixNationsHtml` が各 vevent ブロック（`div.vevent.summary`）を抽出している。ラインアップもこの vevent ブロック内にある wikitable から取得する。
- `lib/scrapers/wikipedia-lineups.ts` には既存の `parseWikipediaLineupHtml` 関数があるが、これは**試合個別ページ**向けに書かれており使用しない。代わりに vevent ブロック内の wikitable を直接パースする新関数を作る。
- `lib/scrapers/fetcher.ts` の `fetchWithPolicy` を使うこと（robots.txt 遵守・レート制限・リトライ自動適用）。

## 実装内容

### 1. `lib/scrapers/wikipedia-lineups.ts` に追加する関数

既存の型定義（`WikipediaLineupPlayer`, `WikipediaMatchLineup`）はそのまま使う。以下の新関数を追加する:

```typescript
/**
 * vevent ブロック（div.vevent.summary）の outerHTML から
 * ラインアップを抽出する。
 *
 * Wikipedia の vevent 内 wikitable の構造:
 *   - 0 枚目: スコアテーブル（ホーム | スコア | アウェイ）
 *   - 1 枚目: ホームラインアップ（No. | 選手名 [| ポジション]）
 *   - 2 枚目: アウェイラインアップ（同上）
 *
 * wikitable が 3 枚未満の場合（ラインアップ未掲載）は null を返す。
 */
export function parseLineupFromVeventHtml(
  veventHtml: string,
  sourceUrl: string,
): WikipediaMatchLineup | null
```

実装指針:
- `cheerio.load(veventHtml)` でパース
- `table.wikitable` を全て取得し、インデックス 1（ホーム）と 2（アウェイ）を使う（0 はスコアテーブル）
- 各テーブルの `tr` をスキャン。1 列目（`td:eq(0)`）が 1〜23 の整数なら `jersey_number`、2 列目（`td:eq(1)`）の `a` タグのテキスト、なければセルテキストを `name` として取得
- `announced_at` はスクレイプ実行時刻（`new Date().toISOString()`）
- home/away どちらも 0 人なら `null` を返す
- `normalizeWhitespace` は既存の実装を使う

### 2. `scripts/backfill-match-lineups.ts`

`backfill-match-events.ts` の構造をそのまま踏襲して実装する。

```
Usage: node --env-file=.env.local tools/run-ts.cjs scripts/backfill-match-lineups.ts [--year=2025] [--dry-run]
```

**処理フロー:**

1. `--year`（省略時は全 Six Nations）で対象コンペティションを取得（`slug LIKE 'six-nations-%'`）
2. 対象コンペティションごとに `six-nations-<year>` → `https://en.wikipedia.org/wiki/<year>_Six_Nations_Championship` の URL を組み立て
3. `fetchWithPolicy` でページ取得 → `parseWikipediaSixNationsHtml` で vevent リストを取得
4. DB から `finished` な試合を取得（`home_team.name` と `away_team.name` を JOIN、`match_lineups(id)` も SELECT して既登録チェックに使う）
5. **ラインアップが既に登録済みの試合はスキップ**（`match_lineups` に該当 `match_id` のレコードが存在する場合）
6. vevent の `homeTeamName` + `awayTeamName` で DB 試合と突き合わせ
7. `parseLineupFromVeventHtml(match.rawHtml, pageUrl)` でラインアップを取得
8. `null` の場合（ラインアップ未掲載）はスキップしてログ出力
9. `ensurePlayerIds` で `players` テーブルに upsert（`app/api/cron/ingest-lineups/route.ts` と同じロジック。スクリプト内にインライン実装する）
10. `match_lineups` に upsert（`onConflict: "match_id,team_id,jersey_number"`）
11. 大会間で `sleep(1000)` を挟む（レート制限配慮）

**型定義（スクリプト内ローカル）:**

```typescript
type CompetitionRow = { id: string; season: string; slug: string };
type MatchRow = {
  id: string;
  competition_id: string;
  home_team_id: string;
  away_team_id: string;
  home_team: { name: string } | null;
  away_team: { name: string } | null;
  match_lineups: Array<{ id: string }>;
};
```

**ログ出力例:**

```
Target finished Six Nations matches without lineups: 15
[dry-run] 2025 France v Scotland: home=15 away=15
Inserted lineups for 2025 France v Scotland: home=15 away=14
Lineup not found in vevent for 2025 Italy v Wales (skipped)
Backfill complete: target_matches=15 with_lineups=14 skipped=1 dry_run=false
```

## 参照ファイル

設計パターン:
- `scripts/backfill-match-events.ts` — 全体構造のテンプレート（必ず読むこと）
- `app/api/cron/ingest-lineups/route.ts` — `ensurePlayerIds` ロジック（必ず読むこと）
- `lib/ingestion/sources/wikipedia-six-nations.ts` — `parseWikipediaSixNationsHtml`（vevent 抽出）
- `lib/scrapers/wikipedia-lineups.ts` — 既存の型定義と `parseLineupTable` の参考実装
- `lib/scrapers/fetcher.ts` — `fetchWithPolicy`

DB:
- `match_lineups`: `(match_id, team_id, jersey_number)` unique
- `players`: `(team_id, name)` unique

## 完了条件

- [ ] `pnpm typecheck` が通る
- [ ] `pnpm test` が全グリーン（新規テスト不要。型変更追随のみ確認）
- [ ] `--dry-run --year=2025` で実行し、試合ごとの home/away 人数がログに出る
- [ ] `--year=2025` で実行後、`match_lineups` テーブルに行が増えている
- [ ] ラインアップ未掲載の試合はエラーにならずスキップされる
- [ ] `match_lineups` 登録済みの試合は再実行でスキップされる（冪等）
