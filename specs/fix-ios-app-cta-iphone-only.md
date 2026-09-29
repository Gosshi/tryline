# Web のアプリ案内の「iPhone・iPad アプリ」を「iPhone アプリ」に直す

## 背景

2026-09-29 の iOS アプリの外部監査（tryline-mobile `docs/notes/gpt-audit-2026-09-29/`）で、Web の案内と App Store の対応端末の食い違いを指摘された。

- Web の案内（`components/ios-app-cta.tsx:14`）: 「iPhone・iPad アプリ」
- アプリ: iPhone のみ対応（tryline-mobile `app.config.ts` の `supportsTablet: false`、App Store の表示も「iPhoneのみ対応」）

iPad で案内を押した人は、入れられないアプリのページに着く。

## スコープ

**対象**: `components/ios-app-cta.tsx` の見出しの文言だけ。

**対象外**: 案内のほかの文言、置き場所、リンク先、計測。

## データモデル変更

なし。

## API サーフェス

なし。

## UI サーフェス

`components/ios-app-cta.tsx:14` の `iPhone・iPad アプリ` を `iPhone アプリ` にする。

## LLM 連携

なし。

## 受け入れ条件

1. `IosAppCta` を描画すると「iPhone アプリ」が表示され、「iPad」の文字を含まない（テストで確認。既存のテストがあれば合わせる）。
2. `grep -rn "iPhone・iPad" app components lib` が 0 件（標準エラーを捨てずに実行し、出力を PR 本文に貼る）。
3. `pnpm lint`、`pnpm typecheck`、`pnpm test` が通る。**3 つとも実行して、結果を完了報告に含める。**

## 未解決の質問

なし。
