# 大会ページ: ヒーロー画像の重複・未設定修正

## 背景

`app/c/[competition]/page.tsx` の `COMPETITION_HERO_IMAGES` に
以下の大会スラッグが未登録で、`DEFAULT_COMPETITION_HERO`（汎用ラグビー画像）に
フォールバックしている。

```typescript
const COMPETITION_HERO_IMAGES: Record<string, string> = {
  "six-nations":     "...",
  "premiership":     "...",
  "urc":             "...",
  "top-14":          "...",
  "super-rugby-pacific": "...",
  "rugby-championship":  "...",
  "rwc":             "...",
  // 以下が未登録（存在する大会スラッグ）
  // "autumn-nations"
  // "pnc"
  // "league-one"
};
```

さらに `rwc` は `six-nations` と同じ Unsplash 画像 URL を使用しており、
視覚的な区別がつかない。大会ページのヒーローは大会の雰囲気を伝える重要な要素であり、
使い回しはブランド品質を下げる。

## スコープ

対象:
- `app/c/[competition]/page.tsx` の `COMPETITION_HERO_IMAGES` への大会スラッグ追加
- `rwc` の画像 URL を `six-nations` と異なる画像に変更

対象外:
- 画像ホスティングの変更（Unsplash の URL を使い続ける）
- シーズンページ（`app/c/[competition]/[season]/page.tsx`）のヒーロー画像（別仕様書で対応）
- 画像の著作権確認（Unsplash のフリー画像を使用する前提）

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

### 追加・変更するスラッグと画像

各大会を連想できるラグビー画像を Unsplash から選ぶこと。
以下の URL パターンを使うこと: `https://images.unsplash.com/photo-{photo-id}?w=1200&q=80`

| スラッグ | 大会名 | 要件 |
|----------|--------|------|
| `autumn-nations` | Autumn Nations Series | 秋のスタジアムまたはナイトゲームの雰囲気 |
| `pnc` | Pacific Nations Cup | 太平洋・島嶼感のある画像（フィジー・サモア・トンガ） |
| `league-one` | リーグワン | 日本のラグビー・または屋内スタジアム |
| `rwc` | Rugby World Cup | 現状は `six-nations` と同じ URL → 別の画像に変更 |

選定基準:
- `?w=1200&q=80` のパラメータ付き URL であること
- 画像内に文字・ロゴ・商標が写り込んでいないこと
- アスペクト比はワイド（16:9 相当）が望ましい

### 表示位置

`app/c/[competition]/page.tsx:97` 付近:

```tsx
<Image
  src={COMPETITION_HERO_IMAGES[competition] ?? DEFAULT_COMPETITION_HERO}
  alt={`${name} ヒーロー画像`}
  ...
/>
```

## LLM 連携

なし

## 受け入れ条件

1. `COMPETITION_HERO_IMAGES` に `autumn-nations`・`pnc`・`league-one` のエントリが追加されている
2. `rwc` の画像 URL が `six-nations` と異なる URL に変更されている
3. 追加した 4 スラッグすべてで Playwright スクリーンショットを撮り、
   ヒーロー画像が表示されていること（DEFAULT_COMPETITION_HERO が表示されていないこと）
4. `tsc --noEmit` でビルドエラーなし

## 未解決の質問

- `pnc` スラッグは `pacific-nations-cup` など別表記の可能性があるため、
  DB の `competitions.slug` 値（または `formatFamilyName` の逆引き）を確認してから追加すること
- `league-one` の大会スラッグが実際に `league-one` であることを
  `lib/db/queries/competitions.ts` または competitions テーブルで確認すること
