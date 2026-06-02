# Codex プロンプト: /pricing「無料で記事を読む」をサンプル試合に向ける

`/pricing` の「無料で記事を読む」リンクが **`latestCompletedMatch`（最新の終了試合）** を指しており、その試合がサンプル外だと recap はペイウォール ＝**「無料」と書いてあるのに実際は無料で読めない**。O2（`specs/feat-sample-recap-public.md`・`lib/sample-matches.ts`）で無料サンプルができたので、このリンクを**本当に無料で全文読めるサンプル試合**に向け直す。

## 背景
- `app/pricing/page.tsx` L127-131: `trialUrl = latestCompletedMatch ? /matches/${id} : "/"`。これが「無料で記事を読む」リンク（L167-172）。
- `latestCompletedMatch` はサンプル（`SAMPLE_MATCH_IDS`）とは限らず、非サンプルなら recap がペイウォールされる。
- ショーケース抜粋（L239 付近の `sample`、`getRecentlyReviewedMatches(...).then(pickVerifiedSample)`）も別の試合で、リンク先と不一致。

## 確定方針
- **Primary サンプル = `a06219be-9d24-486b-92a5-7f9f88ef8826`**（Northampton 36-32 Gloucester・Premiership・接戦・preview＋recap 完備）。
- 「無料で記事を読む」リンクと、ショーケース抜粋を **この同一サンプル試合に統一**（抜粋を見る→クリック→全文を無料で読める、の一貫導線）。

## 実装
1. `lib/sample-matches.ts` に **`PRIMARY_SAMPLE_MATCH_ID = "a06219be-9d24-486b-92a5-7f9f88ef8826"`** を追加（`SAMPLE_MATCH_IDS` に含まれることを保つ）。差し替えは1箇所で。
2. `app/pricing/page.tsx`:
   - `trialUrl` を **`/matches/${PRIMARY_SAMPLE_MATCH_ID}`** に変更（`latestCompletedMatch` 依存をやめる。他で `latestCompletedMatch` を使っていなければ取得自体も削除可）。
   - ショーケース抜粋（`sample`）も **`PRIMARY_SAMPLE_MATCH_ID` の試合**から取得（home/away・大会・recap 抜粋）。`pickVerifiedSample` の動的選定をやめ、固定 primary サンプルにする。preview もある試合なので抜粋は recap 冒頭で良い。
3. リンク文言「無料で記事を読む」は維持（リンク先が本当に無料になったので約束が果たされる）。

## 必ず処理すべきエッジケース
1. Primary サンプルの recap が（万一）未公開でも 500 にしない。フォールバック（`SAMPLE_MATCH_IDS` の先頭 or `/`）。
2. `latestCompletedMatch` を他箇所で使っているなら壊さない。使っていなければ import/取得を整理。
3. 抜粋は recap 本文の冒頭を適切な長さで（既存の `recapExcerpt` 整形を流用）。

## テスト
- pricing ページのテストで「無料で記事を読む」の href が `/matches/${PRIMARY_SAMPLE_MATCH_ID}` であること、ショーケースが primary サンプルの内容であることを検証。
- 既存 pricing テスト（`tests/app/pricing-page.test.tsx`）を壊さない。

## 完了の定義
- `/pricing` の「無料で記事を読む」が primary サンプル（`a06219be…`）に向く。
- ショーケース抜粋が同一試合。
- `pnpm typecheck` / `pnpm build` / `pnpm test`（全件）グリーン。
- 変更ファイル・PRIMARY_SAMPLE_MATCH_ID の場所を末尾に要約。

## デプロイ後の確認（Owner）
`/pricing` の「無料で記事を読む」→ `/matches/a06219be…` に飛び、**ログアウトでも recap 全文が読める**（O2 サンプルなので）。`curl -s <pricing> | grep -o 'matches/a06219be'` で href 確認可。
