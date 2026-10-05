# Codex 指示書: トップの「INTRODUCTION FILM」に紹介動画を入れる

仕様書: `specs/feat-home-intro-film.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら、実装を進めずその場で止めて Owner に確認する。**最新の `origin/main` からブランチを切る。**

## やること

1. `docs/notes/promo-video-2026-10-05/tryline-promo-720p-hero.mp4` と `tryline-promo-poster.jpg` を `public/videos/tryline-promo-720p.mp4` と `public/videos/tryline-promo-poster.jpg` にコピーしてコミットする。
2. `app/page.tsx` の `figure.tl-introduction-poster` を 16:9 にし、サーバーの HTML ではポスターだけを出す。
3. 幅 701px 以上かつ Reduce Motion でないときだけ、読み込み後に `<video>` の `src` を付けて自動再生（muted / playsInline / loop）。一時停止・再生のボタンを付ける。
4. 枠の下の文言を仕様書どおりに変える。

## 守ること

- 700px 以下・Reduce Motion・JavaScript 無効では動画のファイルを取得しない。
- 既存の `cta_id`、トップのそれ以外の配置と動きを変えない。
- `docs/notes/promo-video-2026-10-05/` のファイルは消さない・移動しない（コピーする）。

## 検証

- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build`。**すべて必ず実行し、結果を完了報告に含める。**
- 受け入れ条件 1・2 の Playwright での確認結果、4 の LCP / CLS、8 のスクリーンショットを PR 本文に書く。プレビューが保護されていて確認できない項目はそう書けばよい（Claude Code が Owner のブラウザで確認する）。
- PR を出したらマージを待つ。
