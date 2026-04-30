# 過去試合結果バックフィル 2020-2024（p1-historical-results-backfill-2020-2024）

## 背景

`p1-historical-results-backfill.md` で 2025/2026 の 30 試合を取り込み済み。しかし H2H・recent_form を 5 件埋めるには 2024 以前のデータが不足している。Six Nations 2020〜2024（各 15 試合、計 75 試合）を追加することで、LLM に渡るコンテキストが質的に改善する。

## スコープ

**対象:**
- `scripts/extract-six-nations-wikipedia.ts` — 対象年度を 2020〜2026 に拡張
- `scripts/import-six-nations-results.ts` — 対象年度を 2020〜2026 に拡張
- `data/six-nations/2020-results.json` 〜 `data/six-nations/2024-results.json` — 抽出結果（コミット対象）

**対象外:**
- `lib/llm/stages/assemble.ts` の変更（データが入れば自動で活用される）
- cron・API エンドポイントの追加（一度限りの手動実行）
- ラインナップ・イベントデータ（別仕様書）

## データモデル変更

### スキーマ変更: なし

### 新規レコード

**`competitions` テーブル（5 件追加）:**

| slug | name | season | start_date | end_date |
|---|---|---|---|---|
| `six-nations-2020` | `Six Nations 2020` | `2020` | `2020-02-01` | `2020-10-31` |
| `six-nations-2021` | `Six Nations 2021` | `2021` | `2021-02-06` | `2021-10-30` |
| `six-nations-2022` | `Six Nations 2022` | `2022` | `2022-02-05` | `2022-03-19` |
| `six-nations-2023` | `Six Nations 2023` | `2023` | `2023-02-04` | `2023-03-18` |
| `six-nations-2024` | `Six Nations 2024` | `2024` | `2024-02-02` | `2024-03-16` |

> 2020・2021 は COVID により最終ラウンドが 10 月に延期された。`end_date` はその最終試合に合わせる。

**`matches` テーブル（最大 75 件追加）:**

- `status = 'finished'`
- `external_ids` の形式は 2025/2026 バックフィルと同様

## JSON ファイル形式

既存の `HistoricalMatchResult` 型（`data/six-nations/2025-results.json` と同一スキーマ）を使用する。`season` フィールドは各年度の数値。

## Wikipedia URL

| year | URL |
|---|---|
| 2020 | `https://en.wikipedia.org/wiki/2020_Six_Nations_Championship` |
| 2021 | `https://en.wikipedia.org/wiki/2021_Six_Nations_Championship` |
| 2022 | `https://en.wikipedia.org/wiki/2022_Six_Nations_Championship` |
| 2023 | `https://en.wikipedia.org/wiki/2023_Six_Nations_Championship` |
| 2024 | `https://en.wikipedia.org/wiki/2024_Six_Nations_Championship` |

## 実装詳細

### `scripts/extract-six-nations-wikipedia.ts`

受け付ける year の範囲を `2020〜2026` に拡張する（現在は 2025/2026 のみ）。Wikipedia URL のマッピングにも各年度を追加する。それ以外の引数は `process.exit(1)` のまま。

### `scripts/import-six-nations-results.ts`

受け付ける year の範囲を `2020〜2026` に拡張する。competition の upsert 対象に 5 年分を追加する（上記テーブルの slug/name/dates を使用）。それ以外の挙動は変更なし。

### 実行順序

各年度ごとに extract → import を繰り返す。JSON ファイルは全年度リポジトリにコミットする。

```
pnpm tsx scripts/extract-six-nations-wikipedia.ts 2020
pnpm tsx scripts/import-six-nations-results.ts 2020
# ... 2021〜2024 を繰り返す
```

## API・UI サーフェス

なし（手動実行スクリプトのみ）。

## LLM 連携

なし（データ取り込みのみ。`assemble.ts` の既存クエリが自動的に活用する）。

## 受け入れ条件

- [ ] `data/six-nations/2020-results.json` 〜 `data/six-nations/2024-results.json` が各 15 試合分のデータを含んでいる
- [ ] 各年度で `pnpm tsx scripts/import-six-nations-results.ts <year>` が冪等に実行できる
- [ ] import 後に `competitions` テーブルに `six-nations-2020` 〜 `six-nations-2024` が存在する
- [ ] import 後に `matches` テーブルに `status='finished'` かつ `home_score IS NOT NULL` のレコードが 75 件増えている
- [ ] import 後に `generate-content` を Six Nations 2027 の試合で実行すると `assembled.h2h_last_5` に 2020〜2026 の試合が含まれ最大 5 件埋まる
- [ ] `pnpm lint` / `pnpm typecheck` が通る

## 注意事項

2020・2021 の Wikipedia ページは COVID による延期試合の記述が通常年と異なる可能性がある。パーサーが試合を正しく 15 件抽出できない場合、Codex は Owner に報告して対処方法を確認すること（強引に変換しない）。

## 未解決の質問

現時点なし。
