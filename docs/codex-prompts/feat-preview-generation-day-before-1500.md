# Codex プロンプト: feat-preview-generation-day-before-1500

`specs/feat-preview-generation-day-before-1500.md` の受け入れ条件に従って実装してください。**仕様の内容をここで繰り返しません。必ず spec を先に全文読んでください。**

## やること（6点）

1. `lib/cron/preview-window.ts` を新規作成し、`previewDueUpperBound(now: Date): string` を実装する
2. `lib/cron/orchestrate.ts` のプレビュー候補取得を、その関数を使う形に置き換える
3. `.github/workflows/cron-weekend-preview-refresh.yml` を `workflow_dispatch` 専用に変える
4. `app/api/cron/audit-prekickoff-readiness/route.ts` の固定36時間窓を同じ関数に置き換える
5. `app/api/cron/matches-with-late-lineups/route.ts` を新規作成する
6. `.github/workflows/cron-preview-lineup-catchup.yml` を新規作成する

**5と6はセットです。** ラインアップが前日15:00 に間に合わなかった試合を、その日の 21:05 に一度だけ拾い直す救済です。

## 先に読むファイル

```
specs/feat-preview-generation-day-before-1500.md
lib/cron/orchestrate.ts
tests/cron/orchestrate.test.ts
.github/workflows/cron-weekend-preview-refresh.yml
.github/workflows/cron-prekickoff-readiness-audit.yml
app/api/cron/audit-prekickoff-readiness/route.ts
app/api/cron/matches-with-recent-manual-facts/route.ts   ← 5 の参照実装
.github/workflows/cron-post-match-recap-refresh.yml       ← 6 の参照実装（火曜分岐）
lib/ingestion/league-one-lineups.ts                       ← upsert の onConflict を確認する
app/api/cron/ingest-lineups/route.ts                      ← 同上
```

## 関数の実装は spec の疑似コードをそのまま使ってください

`previewDueUpperBound` の本体は spec の「判定ロジック」節に**完全な形で書いてあります**。**自分で書き直さないでください。** 特に次の2点を変えないこと。

- **`Intl` / `toLocaleString` を使わない。** JST は夏時間を持たないので固定オフセット +9 時間で正しく、`Intl` 経由にすると文字列パースが増えて壊れやすくなります
- **`+33 時間` を `+1日` や `+24時間` に置き換えない。** 33 は「直近に過ぎた JST 15:00 から、その回が担当する翌日の終わり（24:00）まで」の距離です。24 にすると翌日の 15:00 以降にキックオフする試合が落ちます

## 検算表は必ずテストにしてください

spec の「検算」表の4行を、そのまま `previewDueUpperBound` のユニットテストにしてください。**戻り値の ISO 文字列を直接アサートしてください。** 「JST の日付に直すと合っている」といった間接的な確認にしないでください。

## テストは RED から始めてください

受け入れ条件4の3ケース（前日14:00 で対象外 / 前日15:00 で対象 / キックオフ6時間前で対象）は、**先にテストを書いて落ちることを確認してから**実装してください。PR 本文にその順序を書いてください。

既存の `tests/cron/orchestrate.test.ts` は `now` を明示的に渡すモック構成になっています（`:195` 前後、`gte` / `lte` を `matchesBuilder.state` に記録して JS 側でフィルタする形）。**その構成をそのまま使ってください。** 新しいモックを作らないでください。

## workflow の変更で気をつけること

`cron-weekend-preview-refresh.yml` は `schedule:` を消すだけでは終わりません。

`resolve-targets` の `Resolve target date range` ステップに `github.event.schedule` を見る分岐（`5 12 * * 4` / `5 12 * * 5`）が残っています。**この2つの分岐を削除してください。** 残すのは `workflow_dispatch` の分岐と、それ以外のイベントで `exit 1` する else 節です。

**`from` / `to` が空のまま先に進む経路を作らないでください。** 現行の `workflow_dispatch` 分岐にある `YYYY-MM-DD` の正規表現チェックは残してください。空文字を許すと、カレンダー API が `from=&to=` で呼ばれて対象が意図せず広がります。

`name:` は `Manual — Preview Regeneration` に変えますが、**ファイル名 `cron-weekend-preview-refresh.yml` は変えないでください。** 他の spec / codex-prompt から10箇所以上参照されています。

`resolve-targets` / `refresh` / `summarize` の3ジョブ本体、`force=true` の付与、失敗件数を終了コードに反映する処理（PR #758 で入れたもの）は**一切変更しないでください**。

## 救済エンドポイントで一番間違えやすいところ

**`created_at` だけで判定しないでください。必ず `greatest(created_at, updated_at)` を見てください。**

ラインアップの書き込みは2経路とも `onConflict: "match_id,team_id,jersey_number"` の upsert です。**背番号が同じまま選手が入れ替わると既存行が UPDATE され、`created_at` は動きません。** 救済したいのはまさにそのケースです。

`created_at` だけを見る実装でも、spec の受け入れ条件13の**1件目・3件目・4件目は通ってしまいます**。2件目（`created_at` は古いが `updated_at` が新しい）だけが落ちます。**この1件を必ず書いて、先に落ちることを確認してください。**

**supabase-js で条件4を1クエリで書こうとしないでください。** 参照実装（`matches-with-recent-manual-facts/route.ts`）と同じく、2クエリ取って `Map` で突き合わせる形にしてください。

**上限の切り方は `kickoff_at` の昇順です。** 参照実装は降順ですが、こちらはキックオフが近い試合を優先します。**参照実装をコピーして降順のまま残さないでください。**

**上限に 33 などの数値をハードコードしないでください。** `previewDueUpperBound` をそのまま使ってください。

## ワークフローで一番間違えやすいところ

**`count == 0` のとき、`fetch-sourced-facts` も `generate-content` も1回も呼ばれてはいけません。**

ループの中で「0件だから何もしない」形にせず、**`if:` 条件でジョブ自体をスキップ**してください。`cron-post-match-recap-refresh.yml` の火曜分岐が既にその形です（`needs.resolve-targets.outputs.count != '0'`）。**その構造をそのまま真似てください。**

**これはコストの話です。** 本番実測でこの救済の対象は0件であり、**ほぼ毎日0件で空振りする前提の設計**です。0件のときに LLM を呼ぶ実装だと、入れる意味が無くなります。

## 触ってはいけないファイル

```
.github/workflows/cron-live-pipeline.yml
.github/workflows/cron-post-match-recap-refresh.yml
lib/llm/pipeline.ts
lib/llm/sourced-facts/fetch.ts
```

`orchestrate.ts` の中でも、**recap 側の候補取得・`RECAP_BATCH_SIZE`・`EXISTING_CONTENT_STATUSES` は変更対象外**です。`git diff` にこれらが出たら戻してください。

`cron-prekickoff-readiness-audit.yml` は**コメント1行だけ**の変更です。`schedule:` の cron 式 `5 13 * * *` を変えないでください。

## エッジケース

| 状況 | 期待する挙動 |
|---|---|
| JST 00:30 キックオフの試合（前日 15:00 の 9.5 時間後） | 前日 15:00 の回で生成される。下限が無くなったので落ちない |
| 前日 15:00 の回が失敗した試合 | コンテンツ行が作られないので、21:00 / 03:00 / 09:00 の回が同じ条件で拾う |
| 既に published なプレビューがある試合 | `EXISTING_CONTENT_STATUSES` で除外される。**二重生成しない** |
| キックオフ済み（`kickoff_at < now`）の scheduled な試合 | `kickoffGte: now` で除外される |
| `now` がちょうど JST 15:00:00.000 | **翌日キックオフを対象に含む**（`>=` 判定。`<` ではない） |

## 完了の定義

1. spec の受け入れ条件19項目すべてを満たす
2. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
3. PR 本文に、spec の「検証」節が求める5点を貼る
   1. 受け入れ条件4の3ケースの RED→GREEN の順序
   2. 受け入れ条件2・6 の `grep` 実行結果
   3. 検算表4件の**実際のテスト出力**
   4. 受け入れ条件13の2件目が、`created_at` だけを見る実装では落ちることの確認記録
   5. 受け入れ条件17を、`count: 0` のモックでどう確認したか

**期待値を手で書き写さないでください。** 実際にコマンドを走らせた出力を貼ってください。
