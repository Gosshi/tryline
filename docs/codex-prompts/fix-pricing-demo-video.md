# Codex 指示書: 料金ページの動画を、刷新後の紹介動画に差し替える

仕様書: `specs/fix-pricing-demo-video.md`（受け入れ条件は仕様書を正とする）

`AGENTS.md` の規約に従う。**最新の `origin/main` からブランチを切る。**

## やること
- `app/pricing/page.tsx` の YouTube の埋め込みの ID を `2kFHgiaI-NA` から `FiIQ26g19ek` に替え、`pricingVideoJsonLd` を仕様書の値にする（`duration: "PT31S"` を追加）。
- JSON-LD の値を確かめるテストを足す（既存の料金ページのテストに合わせる）。

## 守ること
- 価格・プラン・購入の導線・FAQ・`cta_id` は変えない。

## 検証
- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build`。**すべて必ず実行し、結果を完了報告に含める。**
- 受け入れ条件 1 の `rg` の出力を PR 本文に貼る。PR を出したらマージを待つ。
