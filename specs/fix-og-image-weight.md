# og-image.png の軽量化

## 背景

2026-07-03 のデザイン・UI・集客横断レビュー（`docs/design-ui-growth-review-2026-07-03.md` B-9, C-4）で、ホーム・pricing・大会ハブ・シーズンページ・試合ページ等7箇所の OGP フォールバック画像として使われている `public/og-image.png` が **1,478,960 バイト（約1.4MB）** であることが判明した。SNS（X、LINE 等）のクローラは OG 画像取得にタイムアウトやサイズ制限を持つことがあり、共有カードの表示不安定化リスクがある。試合ページ専用の動的 OG（`app/api/og/route.tsx`）は既に軽量なので対象外。

## 根本原因

`public/og-image.png` が最適化されていない状態で配置されている（次元は 1200x630 で正しいが、圧縮されていない）。

## スコープ

**対象:** `public/og-image.png` の再圧縮（1枚のアセット差し替えのみ）

**対象外:**
- `app/api/og/route.tsx`（動的 OG 生成。既存の背景画像合成ロジックは変更しない）
- `public/og-bg.png`（`/api/og` が参照する別アセット。サーバー側で base64 埋め込みされ配信前にレンダリングされるため直接ユーザーに配信されるわけではなく、本 spec の主目的である「クローラへの直接配信の軽量化」には該当しない。余力があれば同様に圧縮してよいが必須ではない）
- 画像の内容・構図自体の変更（`specs/feat-competition-key-visuals.md` で扱う「生成画像への刷新」は別 spec。本 spec は現行画像の圧縮のみ）
- `og-image.png` を参照している7ファイル（`app/page.tsx` 等）のコード変更（パス・サイズは変わらないため参照側の変更は不要）

## データモデル変更

なし。

## API サーフェス

なし。

## 実装詳細

`sharp`（`package.json` に既存の依存関係、`^0.34.5`）を使って `public/og-image.png` を再圧縮する。ワンオフスクリプトとして実行し、実行後は削除してよい（リポジトリに残す必要はない）。

```typescript
// 一時スクリプト例（実行後削除可）
import sharp from "sharp";

await sharp("public/og-image.png")
  .png({ quality: 80, compressionLevel: 9 })
  .toFile("public/og-image-optimized.png");
```

圧縮後、`public/og-image-optimized.png` の内容を確認の上、`public/og-image.png` を上書きする。次元（1200x630）は変更しないこと。

`png` 圧縮で目標サイズ（300KB以下）に届かない場合は、`webp` 変換ではなく `png` のまま `quality` を段階的に下げて調整すること（`.png()` → `.jpeg()` への変更は不可。OGP 画像は透過を使っていないため JPEG でも視覚的には問題ないが、参照している7箇所のファイル名がすべて `og-image.png` 固定のため拡張子・フォーマットを変えると参照側の変更が必要になり、本 spec のスコープ（アセット差し替えのみ）を超える。PNG のまま圧縮すること）。

## 受け入れ条件

1. `public/og-image.png` のファイルサイズが 300KB 以下になっている
2. 画像の次元が 1200x630 のまま変わっていない（`file public/og-image.png` で確認）
3. 画像の内容（構図・視認性）が圧縮前と比較して劣化が目視でわかるレベルでない
4. `og-image.png` を参照している7ファイル（`app/page.tsx`、`app/matches/[id]/page.tsx`、`app/c/[competition]/[season]/page.tsx`、`app/c/[competition]/[season]/round/[round]/page.tsx`、`app/c/[competition]/page.tsx`、`app/pricing/page.tsx`）はコード変更なしで動作する
5. `pnpm build` が通る

## 未解決の質問

- 300KB という目標値は本レビューでの推奨値。もっと厳しい目標（例: 150KB）にするか、画質を優先して 400KB 程度に緩めるかは Owner が仕上がりを見て判断してよい
- `public/og-bg.png`（1.37MB、`/api/og` が参照）も同様に圧縮するかは任意対応。本 spec の必須スコープには含めない
