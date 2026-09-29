# iOS 通知の本文の大会名を日本語にする

## 背景

- #901（`specs/fix-push-content-notification-body.md`）で、プレビュー・レビューの通知の本文を `ホーム v アウェー（大会名）` にした。
- 大会名は `lib/push/notifications.ts:97-102` の `displayCompetitionName` が `competition.nameJa ?? competition.name` で出している。試合前の通知の本文（`:135`）も同じ関数を使う。
- `competitions.name_ja` が空の大会が多い。2026-09-29 に `nations-championship-2026`・`premiership-2026-27` の `name_ja` が `null` であることを本番 DB で確認した。このため、実際の通知は「ウェールズ v 日本（Nations Championship 2026）」のように**英語の大会名**になる。
- サイトとアプリのほかの画面は `getCompetitionDisplayName`（`lib/format/competition.ts:13`）を使う。この関数は `name_ja` が空でも、`family`（無ければ `slug` から推測）で `JAPANESE_COMPETITION_NAMES_BY_FAMILY` の日本語名を引く（`memory: project_competition_name_ja_overwritten_by_ingest`）。通知だけがこの関数を通っていない。これは #901 の spec の見落とし。
- App Store の 1.0.2 のスクリーンショット（tryline-mobile `docs/notes/app-store-screenshots-1.0.2/03-team-notifications.png`）は、直した後の日本語の表記で作っている。スクリーンショットと実際の通知が食い違わないよう、公開前に直す。

## スコープ

**対象**: プレビュー・レビュー・試合前の 3 種類の通知の本文の大会名。

**対象外**: 見出し（「プレビュー公開」など）、チーム名、スコアを出さない方針、送信の条件。

## データモデル変更

なし。

## API サーフェス

### `lib/push/notifications.ts`

1. `displayCompetitionName` を削除し、本文を作る 3 か所（`buildBody` の試合前・プレビュー・レビュー）で `getCompetitionDisplayName(match.competition, "ja")` を使う。
2. `PushMatch.competition` の型に `family?: string | null` と `slug?: string | null` を足す。
3. プレビュー・レビューの対象を取る問い合わせ（`getRecentPublishedContentRows` の `competition:competitions!matches_competition_id_fkey ( name, name_ja )`）に `family, slug` を足し、`ContentNotificationRow` の型と `mapContentRow`（`:357-360` 付近）で `family`・`slug` を `PushMatch.competition` に渡す。
4. 試合前の通知は `CalendarMatch` を受け取る（`app/api/cron/send-prematch-notifications/route.ts` → `getMatchesInRange`）。`CalendarMatch.competition` には `slug` があるので、`PushMatch` へ変換する箇所で `slug` を渡す（`family` が無ければ `getCompetitionDisplayName` が `slug` から推測する）。

## UI サーフェス

iOS の通知の本文だけ。

## LLM 連携

なし。

## 受け入れ条件

1. `name_ja = null`・`family = "nations-championship"`・`name = "Nations Championship 2026"` の試合のプレビュー通知の本文が `ウェールズ v 日本（ネーションズチャンピオンシップ）` になる（`JAPANESE_COMPETITION_NAMES_BY_FAMILY` の値。テストでは定数から期待値を作らず、この文字列を直接書く）。
2. `family` が `null` で `slug = "premiership-2026-27"` のレビュー通知の本文に「プレミアシップ」が入り、「Premiership」が入らない。
3. `name_ja` がある大会は、今までどおり `name_ja` が使われる。
4. 試合前の通知の本文も、`name_ja = null`・`slug` だけの試合で日本語の大会名になる。
5. 既存のテスト（`tests/api/ios-push-cron.test.ts` の本文の assert）が通る。落ちるものは新しい期待値に合わせる（テストは消さない）。PR 本文に一覧を書く。
6. **壊して落ちる確認（コミットしない）:** `buildBody` を `nameJa ?? name` に戻すと、受け入れ条件 1 のテストが落ちること。
7. `pnpm lint`、`pnpm typecheck`、`pnpm test` が通る。**3 つとも実行して、結果を完了報告に含める。**

## マージ後の確認（Claude Code が行う）

8. 次に送られた通知について、Vercel のログか `push_notification_log` と試合の大会から、本文の大会名が日本語になる組み合わせであることを確かめる。

## 未解決の質問

なし。
