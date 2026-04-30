# 過去試合結果バックフィル（p1-historical-results-backfill）

## 背景

コンテンツパイプライン（`p1-content-pipeline.md`）の `assembleMatchContentInput` は `recent_form`・`h2h_last_5`・`key_stats` を `matches` テーブルの `status='finished'` レコードから集計するが、現在 DB に入っているのは Six Nations 2027 の試合のみで過去結果が皆無のため、LLM に渡るコンテキストが空になっている。

Six Nations 2025・2026 の全試合結果（各 15 試合、計 30 試合）を Wikipedia からスクレイプして `matches` テーブルに取り込み、`recent_form` と `h2h_last_5` を実データで埋める。

## スコープ

**対象:**
- `lib/ingestion/sources/wikipedia-six-nations.ts` — 2027 専用パーサーを年度汎用化
- `scripts/extract-six-nations-wikipedia.ts` — Wikipedia HTML → JSON ファイル出力
- `scripts/import-six-nations-results.ts` — JSON ファイル → DB upsert
- `data/six-nations/2025-results.json` — 抽出結果（コミット対象）
- `data/six-nations/2026-results.json` — 抽出結果（コミット対象）

**対象外:**
- `lib/llm/stages/assemble.ts` の変更（既存クエリはデータが入れば正しく動く）
- `vercel.json` / cron エンドポイント（バックフィルは一度限りの手動実行）
- 2027 以前の他リーグ（Premiership・URC 等）
- 2024 以前の Six Nations（Phase 1 では 2025/2026 の 30 試合で十分）
- ラインナップ取り込み（選手データは `p1-squad-ingestion.md` で対応済み）

## データモデル変更

### スキーマ変更: なし

既存テーブルをそのまま使用する。

### 新規レコード

**`competitions` テーブル（2 件追加）:**

| slug | name | season | start_date | end_date |
|---|---|---|---|---|
| `six-nations-2025` | `Six Nations 2025` | `2025` | `2025-01-31` | `2025-03-15` |
| `six-nations-2026` | `Six Nations 2026` | `2026` | `2026-02-05` | `2026-03-14` |

`on conflict (slug) do update` で冪等に実行する。

**`matches` テーブル（最大 30 件追加）:**

- `status = 'finished'`
- `home_score` / `away_score` は Wikipedia のスコアをそのまま格納
- `external_ids` に以下を保存:

```json
{
  "source": "wikipedia",
  "wikipedia_page": "2025_Six_Nations_Championship",
  "wikipedia_url": "https://en.wikipedia.org/wiki/2025_Six_Nations_Championship",
  "wikipedia_event_id": "Round_1_1",
  "wikipedia_round": 1
}
```

upsert キーは `competition_id + home_team_id + away_team_id + kickoff_at` の組み合わせ。DB ユニーク制約は追加せず、アプリ側で `on conflict` を制御する。

## JSON ファイル形式

`data/six-nations/{year}-results.json` のスキーマ:

```typescript
type HistoricalMatchResult = {
  season: number;               // 2025 | 2026
  round: number | null;
  kickoff_at: string;           // ISO 8601 UTC
  home_team_slug: string;       // "england" | "france" | "ireland" | "scotland" | "wales" | "italy"
  away_team_slug: string;
  home_score: number;
  away_score: number;
  venue: string | null;
  source_url: string;
  wikipedia_event_id: string | null;
};
```

## 実装詳細

### `lib/ingestion/sources/wikipedia-six-nations.ts`（既存ファイルの汎用化）

`lib/ingestion/sources/wikipedia-six-nations-2027.ts` の `parseWikipediaSixNations2027Html` を `parseWikipediaSixNationsHtml` に改名してエクスポートする。既存の `wikipedia-six-nations-2027.ts` からは `parseWikipediaSixNationsHtml` を re-export して後方互換を保つ。

### `scripts/extract-six-nations-wikipedia.ts`

```
pnpm tsx scripts/extract-six-nations-wikipedia.ts <year>
# 例: pnpm tsx scripts/extract-six-nations-wikipedia.ts 2025
```

- `fetchWithPolicy` で Wikipedia ページを取得
- `parseWikipediaSixNationsHtml` でパース
- **取得試合数が 15 件でなければ `process.exit(1)` で終了する**（チェック必須）
- チームスラッグへの変換（Wikipedia 表記 → DB slug）
- 結果を `data/six-nations/{year}-results.json` に書き出す（stdout ではなくファイル出力）

Wikipedia URL は以下を使用:
- 2025: `https://en.wikipedia.org/wiki/2025_Six_Nations_Championship`
- 2026: `https://en.wikipedia.org/wiki/2026_Six_Nations_Championship`

### `scripts/import-six-nations-results.ts`

```
pnpm tsx scripts/import-six-nations-results.ts <year>
# 例: pnpm tsx scripts/import-six-nations-results.ts 2025
```

- `data/six-nations/{year}-results.json` を読み込む
- **JSON に含まれる試合数が 15 件でなければ `process.exit(1)` で終了する**
- competition を upsert（`on conflict (slug) do update`）
- teams を slug で lookup し ID 解決（見つからない slug があれば終了）
- matches を upsert:
  - `status = 'finished'`
  - `on conflict (competition_id, home_team_id, away_team_id, kickoff_at) do update`
- 完了後に upsert 件数を `console.log` で報告する

Supabase クライアントは `@/lib/db/server` の `getSupabaseServerClient` を使用。`.env.local` の環境変数を読む。

## API サーフェス

なし（手動実行スクリプトのみ）。

## UI サーフェス

なし。

## LLM 連携

なし（データ取り込みのみ。`assemble.ts` の既存クエリが自動的に活用する）。

## 受け入れ条件

- [ ] `data/six-nations/2025-results.json` が 15 試合分のデータを含んでいる
- [ ] `data/six-nations/2026-results.json` が 15 試合分のデータを含んでいる
- [ ] `pnpm tsx scripts/import-six-nations-results.ts 2025` が冪等に実行できる（2 回実行しても重複しない）
- [ ] `pnpm tsx scripts/import-six-nations-results.ts 2026` が冪等に実行できる
- [ ] import 後に `competitions` テーブルに `six-nations-2025`・`six-nations-2026` が存在する
- [ ] import 後に `matches` テーブルに `status='finished'` かつ `home_score IS NOT NULL` のレコードが 30 件追加されている
- [ ] import 後に `generate-content` を Six Nations 2027 の試合で実行すると `assembled.recent_form.home` が空でない
- [ ] `pnpm lint` / `pnpm typecheck` が通る

## 決定事項

1. **取り込み対象**: 2025・2026 の Six Nations のみ（計 30 試合）。h2h_last_5 は最大 2 件になるが MVP では十分
2. **実行方式**: 定期 cron ではなく手動実行スクリプト。過去データの backfill は一度限りで再実行不要
3. **JSON コミット**: 抽出結果 JSON をリポジトリにコミットする。Wikipedia DOM が将来変わっても DB の根拠データは壊れない
4. **status**: `'finished'`（`matches.status` の check 制約に合わせる）
5. **assemble.ts 変更なし**: 既存クエリはデータが入れば正しく動作するため変更不要
6. **15 試合バリデーション**: extractor・importer の両方で試合数チェックを行い、不整合を早期検出する

## 未解決の質問

現時点なし。疑問が生じた場合は Codex が実装前に Owner に確認する。
