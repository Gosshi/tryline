# Codex 指示書: Web のネタバレ防止を、ログインしなくても使えるようにする

仕様書: `specs/feat-web-spoiler-guard-without-login.md`（受け入れ条件は仕様書を正とする）

`AGENTS.md` の規約に従う。**最新の `origin/main` からブランチを切る。**

## やること
- 着手前に次を PR 本文に貼る: `rg -n "SpoilerScore|HomepageSpoilerScore" app components` の一覧、囲っていないのにスコアを出している箇所の一覧、試合のページの「隠すもの／隠さないもの」の一覧、試合のページの `<title>` に結果が入るかどうか。
- ネタバレ防止の設定を `localStorage`（`tryline:spoiler-guard`）に保存し、ログインの有無に関係なく使えるようにする。
- `app/layout.tsx` の `<head>` に描画前のスクリプトを置き、設定オンなら `<html data-spoiler-guard="on">` を付ける。スコアはサーバーの HTML に入れたまま CSS で隠す（最初の描画から見えないこと）。
- 試合のページで、終わった試合のレビュー・得点推移・得点経過をまとめて隠し、「スコアを表示」でまとめて出す。
- ヘッダー・スマホのメニュー・試合のページの上部などに切り替えを置き、GA4 のイベント `spoiler_guard_toggle` と `spoiler_reveal` を送る。
- 仕様書の受け入れ条件 1〜6 のテストを足す。

## 守ること
- 既定はオフ（今の挙動を変えない）。
- サーバーの HTML のスコアと試合リンク（SEO・#749）を消さない。`<title>`・説明文・OG・JSON-LD は変えない。
- 既存の `cta_id`、通知の仕組み（`push_subscriptions`）、課金の画面を変えない。
- 隠すときは `display: none`（スクリーンリーダーにも読ませない）。

## 検証
- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build`。**すべて必ず実行し、結果を完了報告に含める。**
- 受け入れ条件 7（壊して落ちる）の出力と 10（スクリーンショット）を PR 本文に貼る。PR を出したらマージを待つ。
