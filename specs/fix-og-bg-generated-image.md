# OG画像背景を生成画像に置き換える

## 背景

`app/api/og/route.tsx`（動的 OG 画像生成 API）は `public/og-bg.png`（1200x630）を背景として base64 埋め込みしている。この画像も出所未確認の素材であり、`docs/design-ui-growth-review-2026-07-03.md`（D-8）で生成画像への置き換えプロンプトを用意し、Owner が生成済み（`public/visuals/og-bg.jpg`）。

## スコープ

**対象:** `public/og-bg.png` のアセット差し替えのみ

**対象外:**
- `app/api/og/route.tsx` のロジック変更（背景の fetch・base64 変換・opacity 適用ロジックはそのまま。ファイル名 `/og-bg.png` は固定で変更しない）
- `public/visuals/og-bg.jpg`（生成元。差し替え後も残してよい）

## 実装詳細

`public/visuals/og-bg.jpg` を PNG 形式・1200x630 に変換し、`public/og-bg.png` を上書きする。`app/api/og/route.tsx:27` の `fetch(new URL("/og-bg.png", request.url))` はパス・拡張子ともに変更しないため、コード変更は不要。

```bash
# 変換例（sharp を使う場合。package.json に既存の依存関係）
node -e "
const sharp = require('sharp');
sharp('public/visuals/og-bg.jpg')
  .resize(1200, 630, { fit: 'cover' })
  .png()
  .toFile('public/og-bg.png');
"
```

次元は既存と同じ 1200x630 を維持すること（`/api/og` の `ImageResponse` は `width: 1200, height: 630` 固定で呼び出しているため、背景画像の比率がずれると `object-cover` 相当の描画で意図しないトリミングが起きる可能性がある）。

## 受け入れ条件

1. `public/og-bg.png` が `public/visuals/og-bg.jpg` の内容に差し替わっている
2. 次元が 1200x630 のまま
3. `app/api/og/route.tsx` にコード変更がない（`git diff` で確認）
4. `/api/og` エンドポイント（`type=result` と通常の両方）を実際に叩いて、背景画像が正しく表示されることを確認する
5. `pnpm build` が通る

## 未解決の質問

- なし（アセット差し替えのみの小さな修正）
