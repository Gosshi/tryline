# 料金ページの動画を、刷新後の紹介動画に差し替える

## 背景

料金ページ（`app/pricing/page.tsx`）の「プロダクトデモ」は、2026-05 の YouTube 動画（ID `2kFHgiaI-NA`）を埋め込んでいる。中身が刷新前（D037 以前）の画面で、今のサイト・アプリと見た目が違う。

2026-10-05、Owner が刷新後の紹介動画を YouTube に公開した（Owner 決定: 案 A＝YouTube に上げて差し替え）。
- URL: https://youtu.be/FiIQ26g19ek
- タイトル: 「Tryline 紹介｜海外ラグビーを、日本語で（2026年10月）」（oEmbed で確認、2026-10-05）
- 長さ: 31 秒（`docs/notes/promo-video-2026-10-05/tryline-promo-1080p.mp4` と同じもの）

## スコープ

対象: `app/pricing/page.tsx` の埋め込みと `pricingVideoJsonLd`。
対象外: 料金ページのそれ以外（価格・プラン・購入の導線・FAQ・`cta_id`）。

## データモデル変更 / API サーフェス / LLM 連携

なし。

## UI サーフェス

1. `iframe` の `src` を `https://www.youtube.com/embed/FiIQ26g19ek?rel=0&modestbranding=1` に、`title` を「Tryline 紹介動画」に。
2. `pricingVideoJsonLd` を次にする:
   - `name`: 「Tryline 紹介｜海外ラグビーを、日本語で（2026年10月）」
   - `description`: 「日本語で海外ラグビーを追うための Tryline の紹介。今週の試合と結果を日本時間で、大会ごとの日程・結果・順位表、試合ごとの日本語のプレビューとレビュー、日本代表の対戦成績、スコアを自分で開くまで隠せる iPhone アプリ。」
   - `embedUrl`: `https://www.youtube.com/embed/FiIQ26g19ek`
   - `thumbnailUrl`: `https://i.ytimg.com/vi/FiIQ26g19ek/hqdefault.jpg`（oEmbed が返す値）
   - `uploadDate`: `2026-10-05`
   - `duration`: `PT31S`（新規）
3. 見出し「実際の画面を見てみる」と小見出し「プロダクトデモ」はそのまま。

## 受け入れ条件

1. `rg -n "2kFHgiaI-NA" app components lib` の結果が空（標準エラーを捨てずに実行し、出力を PR 本文に貼る）。
2. 料金ページの生の HTML に `FiIQ26g19ek` が埋め込みと JSON-LD の両方で出る（テストで JSON-LD の値を確認する）。
3. 価格・プラン・購入フォームの送信先（`/api/stripe/checkout`）・`cta_id` が変わらない（既存のテストが通る）。
4. `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build` がすべて通る（CI の `validate`）。

## 未解決の質問

- なし。旧動画（2026-05）を YouTube 側で非公開にするかは Owner が判断する（サイトの変更とは独立）。
