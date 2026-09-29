# Codex 指示書: iOS 通知の本文から「（スコアは開いてから）」と見出しの重複を外す

仕様書: `specs/fix-push-content-notification-body.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら、実装を進めずその場で止めて Owner に確認する。

## やること

`lib/push/notifications.ts` の `buildBody` で、プレビューとレビューの本文を `${home} v ${away}（${displayCompetitionName(match.competition)}）` にする。

## 触るファイル

- `lib/push/notifications.ts`
- `tests/api/ios-push-cron.test.ts`

## 守ること

- 見出し（`buildTitle`）と試合前の通知の本文は変えない。
- 本文にスコアを入れない。
- 既存のテストは消さない。本文の assert だけを新しい文面に合わせる。

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test` を実行する（**3 つとも必ず実行し、結果を完了報告に含める**）。
- 「壊して落ちる」確認（コミットしない）: 仕様書の受け入れ条件 6。内容と結果を PR 本文に書く。

## やってはいけないこと

- 本番に通知を送ること（テストはモック）。

## 完了時

- PR 本文に、変更したファイルの一覧、受け入れ条件 1〜7 の確認の方法と結果、「壊して落ちた」確認の内容を書く。
- ブランチは main から新しく切る。共有の作業ツリーにある未コミットの差分を巻き込まない。`git stash -u` は使わない。
- PR の作成まで。マージはしない。
