# Premiership: ヘッダー写真を木のシルエットからラグビーシーンに差し替える

## 背景

`app/c/[competition]/page.tsx` の `COMPETITION_HERO_IMAGES` で
`premiership` に設定されているヘッダー写真が**木のシルエット**（ラグビーと無関係な風景写真）であり、
スポーツメディアとしての品質を損ねている。

関連: `fix-competition-hero-images.md`（PNC・Autumn Nations の重複画像修正）が実装済みのため、
Premiership の画像も合わせて差し替えることが望ましい。

## スコープ

対象:
- `app/c/[competition]/page.tsx` — `COMPETITION_HERO_IMAGES["premiership"]` の URL を変更

対象外:
- 他大会の画像（`fix-competition-hero-images.md` で対応済み）
- 画像の表示サイズ・アスペクト比の変更

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

### 差し替え先の要件

- Premiership らしいラグビーシーン（スクラム・ラインアウト・タックル等）の写真
- 解像度: 最低 1280×400px
- ライセンス: 商用利用可能（Unsplash / Pexels 等）
- フォーマット: WebP または JPEG

### 差し替え手順

```typescript
// app/c/[competition]/page.tsx
const COMPETITION_HERO_IMAGES: Record<string, string> = {
  // 変更前（木のシルエット）
  "premiership": "https://images.unsplash.com/photo-xxxx-tree",
  // 変更後（ラグビーシーン）
  "premiership": "https://images.unsplash.com/photo-xxxx-rugby?w=1280&q=80",
};
```

## LLM 連携

なし

## 受け入れ条件

1. Premiership 大会ページのヘッダーにラグビーシーンの写真が表示される
2. モバイル・PC 双方でヘッダーが正常に表示される
3. `tsc --noEmit` でビルドエラーなし

## 未解決の質問

- 差し替え先の Unsplash URL は Owner が選定すること。
  検索クエリ例: `https://unsplash.com/s/photos/rugby-premiership`