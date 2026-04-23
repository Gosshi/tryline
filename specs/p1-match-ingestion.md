# 試合データ取り込み（p1-match-ingestion）

## 背景

`D007` で決定した通り、MVP ローンチ対象は Six Nations 2027（2027年2〜3月、England / France / Ireland / Scotland / Wales / Italy の 6 代表による総当たり）です。`p1-content-pipeline.md` の 5 段階パイプラインは `matches` / `match_events` / `match_raw_data` が十分に埋まっている前提で動くため、本仕様書ではこれらを実際に Six Nations 2027 のデータで埋める取り込みを対象にします。

スクレイピングは `p1-scraping-infra.md` で定義済みの `lib/scrapers/` 共通基盤の上に構築します。ソース別の実装詳細のみを追加し、robots / レート制限 / リトライの共通ロジックは再発明しません。

## スコープ

対象:
- 競技（`competitions`）と 6 代表チーム（`teams`）の静的シード（マイグレーションまたは TypeScript シードスクリプト）
- `competition_teams` の紐付けシード
- フィクスチャー取り込み（試合日程の取得 → `matches` へ upsert）
- 結果取り込み（スコア・status 更新、主要イベントの `match_events` 追加）
- 生データの `match_raw_data` への保存
- cron エンドポイント（`/api/cron/ingest-fixtures`, `/api/cron/ingest-results`）
- CRON_SECRET による認可
- Six Nations 2027 固有のパーサー（1 ソース 1 ファイル）
- 冪等性（同じ試合を複数回取り込んでも重複行を作らない）
- 実行ログ（簡易: `console.info` 程度、永続化は後続仕様書）
- 単体テスト（モック HTML 入力に対するパース結果の検証）

対象外:
- 選手・スカッドの取り込み（本 PR では `players` テーブルは空のまま。別仕様書 `p1-squad-ingestion.md` で後続）
- Reddit スレッド取り込み（別仕様書 `p1-reddit-ingestion.md` で後続）
- `match_raw_data` の 7 日クリーンアップ cron（別仕様書 `p1-data-retention.md` で後続）
- 管理画面・再取り込み UI
- Six Nations 2027 以外の大会（将来の大会は同じ取り込み層のパーサー追加で対応）
- 再スケジュール（試合の延期対応）: 本 PR では kickoff の update のみで OK、履歴管理しない
- 実ネットワークを叩くテスト

## データソース選定

MVP は **Wikipedia の「2027 Six Nations Championship」記事**を一次ソースとする。

選定理由:
- コンテンツが CC-BY-SA ライセンスで再利用可能（`match_raw_data` への保存 + LLM 書き換えの双方に法的懸念が小さい）
- フィクスチャーが hCalendar マイクロフォーマット（`div.vevent`）で構造化されており、`cheerio` でパース容易
- `robots.txt` で `/wiki/` 配下のクロールは許可されている（2026-04 確認済。禁止は `/wiki/Special:` 等の一部 namespace のみ）
- 公式団体（World Rugby）のサイトより変動が少なく、MVP 向けに安定
- 試合終了後に `Match X` 節にスタッツや主要イベントが記載される

想定 URL: `https://en.wikipedia.org/wiki/2027_Six_Nations_Championship`
- 記事タイトルは `2027 Six Nations Championship`（2026-04 確認済）
- ページ本文・infobox の表示名は `2027 Men's Six Nations Championship` となっており記事名と一致しないが、URL / article title は前者で安定のため本 PR では前者を採用

リスクと対応:
- Wikipedia の表構造は手動編集のため揺れがある。パーサーは「欠損セルは null、形式不一致はエラーログ」の寛容な設計とする
- 誤訳・事実誤りは LLM 層（`p1-content-pipeline.md`）が吸収する前提。ingestion 層は取得した事実をそのまま保存

**将来の拡張**: ESPN Rugby / Rugby Pass 等の商用ソースは別 PR で追加（`p1-espn-ingestion.md` 等）。その時点で複数ソースの突き合わせロジックを検討する。

## シードデータ

### `competitions`

```sql
insert into competitions (slug, name, country, season, start_date, end_date) values
  ('six-nations-2027', 'Six Nations 2027', null, '2027', '2027-02-06', '2027-03-20');
```

開幕日・閉幕日は目安。実際の日程確定後に fixtures 取り込みで update しない（本 PR では `competitions` は固定）。

### `teams`

```sql
insert into teams (slug, name, short_code, country) values
  ('england',  'England',  'ENG', 'GBR'),
  ('france',   'France',   'FRA', 'FRA'),
  ('ireland',  'Ireland',  'IRL', 'IRL'),
  ('scotland', 'Scotland', 'SCO', 'GBR'),
  ('wales',    'Wales',    'WAL', 'GBR'),
  ('italy',    'Italy',    'ITA', 'ITA');
```

### `competition_teams`

上記 6 チームを `six-nations-2027` に紐付ける。

シードは新規マイグレーションファイル `<ts>_seed_six_nations_2027.sql` に書く。Phase 1 専用データで再利用しないため、`supabase/seed.sql` ではなくマイグレーションに入れる（`p1-data-model.md` の方針と整合）。

## モジュール構成

```
/lib/ingestion
  /sources
    wikipedia-six-nations-2027.ts  — Wikipedia の 2027 Six Nations 記事パーサー
  fixtures.ts               — fixtures 取り込みエントリーポイント
  results.ts                — results + events 取り込みエントリーポイント
  upsert.ts                 — matches / match_events への冪等 upsert
/app/api/cron
  ingest-fixtures/route.ts  — POST cron エンドポイント
  ingest-results/route.ts   — POST cron エンドポイント
```

## API サーフェス

### `POST /api/cron/ingest-fixtures`

- 認可: `Authorization: Bearer <CRON_SECRET>`。環境変数から取得
- Body: なし（将来的に competition slug を指定できるようにする拡張余地は残す）
- 処理: Wikipedia 記事を `fetchWithPolicy` で取得 → パース → `matches` に upsert → `match_raw_data` に生 HTML 保存
- レスポンス:

```json
{
  "status": "ok",
  "competition": "six-nations-2027",
  "counts": { "matches_inserted": 3, "matches_updated": 9, "raw_data_rows": 1 },
  "duration_ms": 1842
}
```

### `POST /api/cron/ingest-results`

- 認可: 同上
- 処理: Wikipedia 記事を再取得 → すでに `matches` に存在する試合の `status` が `in_progress` または `finished` に移行したものをスコア・イベントで update
- レスポンス: 上記と同形式に `events_inserted` を追加

### 認可の実装

共通ヘルパー `lib/cron/auth.ts` を追加（or 既存があれば流用）:

```typescript
export function assertCronAuthorized(request: Request): void // throws 401
```

`CRON_SECRET` は `lib/env.ts` に追加し、必須環境変数として扱う。`.env.example` も更新する。

## 冪等性

- `matches`: `(competition_id, home_team_id, away_team_id, kickoff_at)` の unique 制約で衝突時は update。kickoff が変更された試合は別試合として扱われてしまうため、後述の update ポリシーで対応
- `match_events`: `(match_id, minute, type, team_id, coalesce(player_id::text, ''))` の単純比較で既存確認し、なければ insert。厳密な unique 制約は貼らず、アプリ層で重複回避
- `match_raw_data`: 重複 insert を許容（履歴として残す。`p1-scraping-infra.md` の `saveRawData` 方針）

### kickoff 変更への対応

Wikipedia の表から取得した試合が既存 `matches` と同一カード（同じ home/away/competition）で kickoff のみ異なる場合、既存行の `kickoff_at` を update する。この判定は「同一 competition + 同一 home/away ペア + 既存行の status が `scheduled`」を条件とする。finished の試合は触らない。

## スケジューリング

本 PR では Vercel Cron の設定ファイル（`vercel.json`）は追加しない（`p0-foundation.md` で Vercel 連携は対象外としたため）。cron エンドポイント自体は動作可能にし、Owner がローカルで `curl` で叩いて検証できる状態を目指す。

将来 Vercel Cron を設定する際の目安:
- fixtures: 週 1 回（開幕前は毎日）
- results: 試合日の 2〜6 時間後に実行

## パース仕様（Wikipedia）

2026-04 時点の実ページ構造を前提にパーサーを実装する。構造が異なる場合は実装前に Owner に確認する。

### ページ構造

- `#Fixtures` 節配下に `Round 1` 〜 `Round 5` の小見出しがある
- 各試合は `div.vevent.summary` ブロック 1 個で表現される（1 試合 1 ブロック）
- 1 ブロック内には小テーブルが 3 つ入っている（上から: 日時、ホーム × スコア × アウェイ、会場・審判）

### 抽出ルール

- **キックオフ**: `div.vevent` 内の `.dtstart`（ISO 8601 形式の `datetime` 属性またはテキスト）を優先。無い場合は「5 February 2027 / 20:10 GMT」等のテキストを `date-fns` で parse し UTC 正規化
- **ホーム / アウェイチーム**: 2 番目のテーブルの左右セル内 `<a>` のテキスト（例: `Ireland`, `England`）を取得。`teams.name` で lookup し、見つからなければ警告ログを出して当該試合を skip（本 PR ではチーム別名対応なし）
- **スコア**: 2 番目のテーブル中央セルを確認。`27–13` 等の「数字 - 数字 / 数字 – 数字」の正規表現にマッチすれば `home_score` / `away_score` を確定し `status = 'finished'`。キックオフ前は `–` 表示のため parse 失敗時は `null` のまま `status = 'scheduled'` を維持
- **会場**: `.location` マイクロフォーマット要素を優先。無ければ 3 番目のテーブル該当行のテキスト
- **Round（試合節）**: 直近の `Round N` 見出しから整数を取得し、`matches.external_ids.wikipedia_round`（1〜5）に格納する。スキーマ変更は行わない

### 寛容設計 / フォールバック

- `div.vevent` が 1 件も見つからない（Wikipedia 側構造変更）場合は `FetchError` を投げて取り込み全体を中断し、`console.error` でログする
- 個別試合内の 1 フィールド欠損（会場 null 等）は警告ログのみで continue、当該試合は部分データで upsert
- 主要イベント（トライ・カード）の抽出は本 PR では試みず、`match_events` への insert は 0 件で OK

**スコープ調整**: `match_events` の充実は後続仕様書で扱う。本 PR は「日程・対戦カード・スコア・会場」までを確実に動かす。

## テスト戦略

- `tests/ingestion/wikipedia-six-nations-2027.test.ts`: 固定の HTML フィクスチャ（`tests/fixtures/wikipedia-six-nations-2027.html` に保存）をパースし、期待される試合配列が返ることを検証。フィクスチャは実ページから `Round 1` の `div.vevent` ブロック 2 件分を切り出し、`<!-- ... -->` コメントで出典をメモする（`Round 2` 以降は不要）
- `tests/ingestion/upsert.test.ts`: 同じ試合を 2 回 upsert しても `matches` に 1 行しかないことを検証（Supabase ローカル）
- `tests/api/ingest-fixtures.test.ts`: 認可ヘッダなしで 401、正しい Bearer で 200 が返ることを検証（fetch 層はモック）
- 実ネットワーク（Wikipedia への実リクエスト）を叩くテストは作らない

## 環境変数

- `CRON_SECRET` — cron エンドポイントの Bearer 認証用。`.env.example` と `lib/env.ts` に追加

## 依存パッケージ

- `date-fns` — 日付パース（既存に無ければ追加）

追加しない:
- `cheerio` はすでに `p1-scraping-infra.md` で追加済みのため流用

## 受け入れ条件

- [ ] `supabase db reset` 後、`competitions` / `teams` / `competition_teams` にシードデータが入っている（Six Nations 2027 + 6 チーム）
- [ ] `tests/fixtures/wikipedia-six-nations-2027.html`（`Round 1` の vevent 2 件）を入力として fixtures パーサーが 2 試合を返し、`external_ids.wikipedia_round = 1` が付与される
- [ ] `POST /api/cron/ingest-fixtures` が Bearer 無しで 401、正しい値で 200 を返す
- [ ] 同じ fixtures を 2 回取り込んでも `matches` テーブルに重複が発生しない（unique 制約の衝突処理）
- [ ] fixtures 取り込み後に results 取り込みを実行すると、finished 試合の `home_score` / `away_score` / `status` が更新される
- [ ] `match_raw_data` に取り込みごとの生 HTML が保存される
- [ ] `lib/scrapers/` の `fetchWithPolicy` を経由している（直接 `fetch()` を呼んでいない）
- [ ] `.env.example` と `lib/env.ts` に `CRON_SECRET` が追加されている
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` が全てグリーン
- [ ] 実装したファイルが `lib/ingestion/` と `app/api/cron/` 配下に収まり、他モジュールへの侵食がない
- [ ] 単体テスト 3 本（上記 テスト戦略）が全て成功

## 未解決の質問

1. 試合節（Round 1〜5）は本 PR では `matches.external_ids.wikipedia_round` に格納し、`matches` スキーマに `round` カラムは追加しない。将来 UI で節表示が必要になった場合にスキーマ拡張を別 PR で検討する
2. kickoff 時刻が Wikipedia に記載されていない場合、`00:00 UTC` で据え置く（本 PR は据え置きを採用、必要に応じて後続 PR で改善）
