# Top 14 からの撤退

決定: `docs/decisions.md` D038（2026-11-14）。

## 背景

Top 14 は直近60日の公開記事178本のうち84本（最多）を占めている。一方、2026-09-26〜11-13 にクラブ3大会のページへ戻ってきた読者は2人、検索から来た新規は10人だった（D038 の表）。Top 14 は lnr.fr からの取り込みで事故が最も多い大会でもある。記事生成・取り込み・監視をすべて止め、浮いた手間と LLM 費用を日本代表・国際大会・リーグワンに回す。

**止める範囲は Top 14 だけ。** URC・プレミアシップは変えない。

## スコープ

対象:
1. 撤退済みの大会を1か所で定義する（`lib/competitions/retired.ts`）
2. 取り込みを止める（live ソース・試合イベント cron・順位表の計算）
3. 記事生成を止める（orchestrate の候補と、`generateMatchContent` の入口の2か所）
4. 通知を止める（試合前のプッシュ通知・X リマインダー）
5. 表示から外す（ナビ・フッター・トップ・カレンダー）
6. Top 14 の大会ページに更新終了の一文を出す

対象外:
- **既存データの削除・変更**（試合・記事・順位表の行はそのまま。DELETE / UPDATE は行わない）
- 既存の試合ページ・大会ページ・H2H・チームページの URL（200 のまま読める。noindex にもしない）
- サイトマップ（過去の記事は残す。新しい試合が増えないので自然に止まる）
- Top 14 用のスクレイパー・テスト・fixture の削除（戻す可能性を残す。呼び出し元を外すだけ）
- URC・プレミアシップ・スーパーラグビー
- iOS アプリ（tryline-mobile）。アプリ側に `top-14` の固定表示があるかは別途確認する（未解決の質問2）

## データモデル変更

なし。マイグレーションなし。

## 実装

### 1. 撤退済みの大会の定義

新規 `lib/competitions/retired.ts`:

```ts
export const RETIRED_COMPETITION_FAMILIES = ["top-14"] as const;

export function isRetiredCompetitionFamily(
  family: string | null | undefined,
): boolean;
```

- `family` が `null` / `undefined` / 空文字なら `false`
- 以下の2〜5はすべてこの関数を使う。`"top-14"` の文字列比較を各所に書かない

### 2. 取り込みを止める

| 場所 | 変更 |
|---|---|
| `lib/ingestion/live-competitions.ts` | `LIVE_COMPETITION_SOURCES` から `top-14-2026-27` の要素と `fetchTop14LnrLiveMatches` の import を外す |
| `app/api/cron/ingest-standings/route.ts` | `calculateLatestTop14Standings()` の呼び出しと、その結果の分岐・通知（`competition: "top-14"`）を外す。レスポンスは `result: { weekly: ... }` にする |
| `.github/workflows/cron-ingest-top14-match-events.yml` | `on.schedule` を削除する（`workflow_dispatch` は残す） |
| `app/api/cron/ingest-top14-match-events/route.ts` | 変えない（手動実行の経路として残す） |

週次の順位計算（`lib/ingestion/weekly-standings.ts` が使う `scripts/backfill-standings.ts` の `SUPPORTED_FAMILIES`）には元から `top-14` が無いので変えない（2026-11-14 確認）。

### 3. 記事生成を止める（2か所）

**(a) 候補から外す** — `lib/cron/orchestrate.ts` の `getMatchIdsMissingContent`:
- `matches` を取得した直後（`match_content` を引く前、件数の上限をかける前）に、`competition.family` が撤退済みの試合を除く
- 除いた件数は `skippedCount` に混ぜない。`retiredSkippedCount` として返し、`runOrchestrate` のログに出す
- 理由: 上限をかけた後に除くと、Top 14 の候補が枠を埋めて他の大会が生成されなくなる（2026-09 のレビュー枠の不足と同じ構造）

**(b) 入口で止める** — `lib/llm/pipeline.ts` の `generateMatchContent`:
- 最初の DB 読み取り（`assembleMatchContentInput`）の前に、`matches` → `competitions.family` を1回引く
- 撤退済みなら LLM を一度も呼ばずに `{ status: "skipped", skipReason: "competition_retired", qa: null, matchId, contentType }` を返す
- `PipelineResult["skipReason"]` に `"competition_retired"` を足す
- `match_content` に書き込まない。`logPipelineRun` も呼ばない
- 理由: orchestrate 以外の経路（週次リフレッシュ、ラインアップ遅延の救済、Discord・`/ops/facts` の手動事実からの作り直し、スクリプト）もここを通る。候補側だけだと抜け道が残る
- `persist: false`（試し焼き）でも同じく止める

### 4. 通知を止める

| 場所 | 変更 |
|---|---|
| `app/api/cron/send-prematch-notifications/route.ts`（または実際に対象試合を選んでいる関数） | 撤退済みの大会の試合を対象から外す |
| `app/api/cron/x-post-reminders/route.ts` | 同上 |

`notifyRecapReady` は (3) でレビューが作られなくなるため変更不要。

### 5. 表示から外す

| 場所 | 変更 |
|---|---|
| `components/competition-nav-dropdown.tsx` | `family: "top-14"` の項目を削除 |
| `components/site-footer.tsx` | `/c/top-14` のリンクを削除 |
| `lib/db/queries/matches.ts` の `getMatchesInRange` | 撤退済みの大会の試合を返さない（カレンダー・週ボード・トップの今週の試合が共通で使う） |
| `lib/db/queries/matches.ts` の `getUpcomingMatches` / `getNextUpcomingMatch` | 同上 |
| `lib/db/queries/matches.ts` の `getRecentlyReviewedFamilies` / `getRecentlyReviewedCompetitionGroups` | 撤退済みの大会を返さない（トップの最新レビュー欄） |
| `lib/db/queries/competitions.ts` の `listCompetitionScheduleCoverage`・`lib/featured-competition.ts` の `getFeaturedCompetition` | 撤退済みの大会を返さない |
| `app/page.tsx` | `listFamilies()` の結果から撤退済みを除いてから大会リンク（`homepageCompetitionLinks`）を作る |

**`listFamilies()` 自体は変えない。** `/c/[competition]` の静的パラメータ・`app/sitemap.ts`・iOS アプリが読む `/api/v1/competitions` も使っており、ここで外すと既存ページとアプリに影響する。

DB で除外できる関数は、件数の上限（`limit`）より前に除く（`.neq` 等。family は `competitions` 側の列なので、埋め込みの絞り込みが使えない場合は上限を多めに取って JS で除いてから切り詰める。どちらにしたかを PR 本文に書く）。上限の後に除くと、Top 14 が枠を埋めて件数が減る。

除外は**期間を問わず**行う（過去の週を表示したときも Top 14 は出さない）。週ボードは大会ごとに表示するため、一部の週だけ出ると不自然になる。

`lib/x/post-reminders.ts` の `CLUB_COMPETITION_FAMILIES` と `lib/x/post.ts` のハッシュタグ定義は変えない（過去の判定に使われている。害がない）。

### 6. 大会ページの一文

`/c/top-14` と `/c/top-14/[season]` に、ページ上部（大会名の見出しの直下）で次の文を出す:

> トップ14の記事更新は2026年11月で終了しました。これまでの試合結果と記事は引き続きご覧いただけます。

- 撤退済みかどうかは `isRetiredCompetitionFamily(competition)` で判定する（ページ側で `"top-14"` と書かない）
- 既存の配色・余白のトークンを使う（D037）。新しい色や部品は作らない
- `generateMetadata` の title / description は変えない

## API サーフェス

変更なし（新規ルートなし）。`ingest-standings` のレスポンスから `top14` キーがなくなる。

## UI サーフェス

- ナビ（PC のドロップダウン・フッター）から Top 14 が消える
- トップ・カレンダーに Top 14 の試合が出なくなる
- `/c/top-14` 系に更新終了の一文

## LLM 連携

新しい LLM 呼び出しはない。Top 14 の preview/recap 生成が止まるため、費用は減る。減る額は測っていない（直近60日で Top 14 の記事は84本。1本あたりの費用は未集計）。

## 受け入れ条件

1. `isRetiredCompetitionFamily("top-14") === true`、`"urc"` / `"premiership"` / `"league-one"` / `null` / `undefined` / `""` は `false`（単体テスト）
2. `LIVE_COMPETITION_SOURCES` に `family === "top-14"` の要素が無い。`urc-2026-27` と `premiership-2026-27` は残っている（テスト）
3. `ingest-standings` のテスト（`tests/api/ingest-standings.test.ts`）で、`calculateLatestTop14Standings` が呼ばれない。レスポンスに `top14` キーが無い。週次の順位計算は従来どおり呼ばれる
4. `cron-ingest-top14-match-events.yml` に `schedule:` が無く、`workflow_dispatch:` がある（PR 本文に該当部分の diff を貼る）
5. `getMatchIdsMissingContent` に Top 14 の試合2件・URC の試合1件を渡すと、`eligibleMatches` は URC の1件だけ、`retiredSkippedCount === 2`、`skippedCount === 0`（既存コンテンツなし）。`match_content` への問い合わせに Top 14 の ID が含まれない（テスト）
6. `generateMatchContent` に Top 14 の試合を渡すと `status: "skipped"`、`skipReason: "competition_retired"` を返す。OpenAI クライアントのモック・`assembleMatchContentInput`・`logPipelineRun`・`match_content` への書き込みが**一度も呼ばれない**（テスト。`persist: true` と `false` の両方）
7. 同じテストで、URC の試合では従来どおり `assembleMatchContentInput` が呼ばれる（止めすぎていないことの確認）
8. プッシュ通知と X リマインダーの対象選択に Top 14 の試合を混ぜても、Top 14 の試合は選ばれない（それぞれテスト）
9. 5節の表の各関数が Top 14 を返さない（関数ごとにテスト）。`limit: 5` の関数に Top 14 を6件・URC を2件渡したとき、URC の2件が返る（上限より前に除いていることの確認）。既存テスト（`tests/app/calendar-page.test.tsx`・`tests/home-selection.test.ts`・`tests/app/home-page.test.tsx`）の Top 14 fixture は、**Top 14 が「出ないこと」の検証に書き換える**か、他の大会に置き換える。他の大会の期待値は変えない
9a. `listFamilies()` は従来どおり `top-14` を含む（テスト）。`/c/top-14` は 200 を返す
10. `tests/components/competition-nav-dropdown.test.tsx` が Top 14 の項目を期待しない。他の項目の並びは変わらない
11. `/c/top-14` と `/c/top-14/2026-27` の描画結果に更新終了の一文が含まれ、`/c/urc` には含まれない（テスト）
12. **壊して確かめる:** `isRetiredCompetitionFamily` を常に `false` を返すように変えると、5・6・8・9・11 のテストが落ちる。その出力を PR 本文に貼る（変更は戻す）
13. 既存の Top 14 用テスト（`tests/scrapers/top14-*`・`tests/ingestion/top14-lnr-live.test.ts`・`tests/workflows/cron-ingest-top14-match-events.test.ts` 等）は、関数が残っているので通る。ワークフローのテストが `schedule` を前提にしていたら、`schedule` が無いことを検証する形に書き換える
14. `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build` が通る

**マージ後の確認（Claude が行う）:**
- 次の orchestrate 実行のログに `retiredSkippedCount` が出る
- 本番の `/calendar` と `/` の HTML に `/c/top-14` へのリンクが無い。`/c/top-14/2026-27` は 200 で一文が出る
- マージ以降、Top 14 の試合に新しい `match_content` 行が増えていない（SELECT で確認）

## 未解決の質問

1. **ChatGPT 調査の曜日**: 金曜に置いた理由は Top 14 の金曜記事だった。木・土の2回に戻すか、金曜を他の大会（URC・プレミアシップ）に使い続けるか。Owner 判断。コードには影響しない
2. **iOS アプリ**: tryline-mobile に Top 14 の固定表示（大会一覧・オンボーディングの選択肢）があるか。Claude が確認し、あれば別 spec にする
3. **お気に入りに Top 14 のチームを入れている読者**: `user_profiles.favorite_team_slugs` に Top 14 のチームがある人への案内はしない（ユーザー14人で、該当者がいるかは未確認）。必要なら Claude が SELECT で件数を確認する

## 競合とマージ順

- `specs/feat-league-one-2026-27-season.md` と同じ `lib/ingestion/live-competitions.ts` を触る。**どちらを先にマージしてもよいが、後の PR は最新の main に合わせてから出す。** リーグワン側は開幕（2026-12-12）の期限があるので、競合したらリーグワン側を優先する
- `lib/cron/orchestrate.ts` を触る他の未マージ PR があれば、先にマージされた方に合わせる
