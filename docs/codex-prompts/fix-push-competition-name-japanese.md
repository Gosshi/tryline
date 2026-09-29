# Codex 指示書: iOS 通知の本文の大会名を日本語にする

仕様書: `specs/fix-push-competition-name-japanese.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら、実装を進めずその場で止めて Owner に確認する。

## やること

1. `lib/push/notifications.ts` の `displayCompetitionName` を削除し、本文の 3 か所で `getCompetitionDisplayName(match.competition, "ja")`（`lib/format/competition.ts`）を使う。
2. `PushMatch.competition` に `family`・`slug` を足す。
3. プレビュー・レビューの問い合わせに `family, slug` を足し、`mapContentRow` で渡す。試合前の通知は `CalendarMatch.competition.slug` を渡す。

## 触るファイル

- `lib/push/notifications.ts`
- `tests/api/ios-push-cron.test.ts`（または同じ配置の新しいテスト）

## 守ること

- 見出し・チーム名・送信の条件・スコアを出さない方針は変えない。
- 日本語の大会名は `getCompetitionDisplayName` から得る（同じ対応表を書き直さない）。
- 既存のテストは消さない。

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test` を実行する（**3 つとも必ず実行し、結果を完了報告に含める**）。
- 「壊して落ちる」確認（コミットしない）: 仕様書の受け入れ条件 6。内容と結果を PR 本文に書く。

## やってはいけないこと

- 本番に通知を送ること（テストはモック）。
- `competitions.name_ja` を DB で埋めること（取り込みの定数で上書きされるため、コード側で直す）。

## 完了時

- PR 本文に、変更したファイルの一覧、受け入れ条件 1〜7 の確認の方法と結果、書き換えた既存の assert の一覧、「壊して落ちた」確認の内容を書く。
- ブランチは main から新しく切る。共有の作業ツリーにある未コミットの差分を巻き込まない。`git stash -u` は使わない。
- PR の作成まで。マージはしない。
