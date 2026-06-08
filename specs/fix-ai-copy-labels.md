# UI コピーから "AI" ラベルを除去

## 背景

「AI解説」「AI日本語レビュー」等の文言は、AIコンテンツに嫌悪感を持つ層のトリガーになりうる。生成手段をわざわざ強調せず、コンテンツ品質で勝負する方針に変更する（2026-06-07 決定）。

データパイプライン・アーキテクチャは変更しない。対象は UI テキスト・OGP メタ・ページタイトルのコピーのみ。

**変更しない箇所**: `components/match-chat.tsx` の "AI CHAT"/"AI チャット" および `components/sample-recap-cta.tsx` の "試合 AI チャット"（これらはリアルタイム AI チャット機能そのものの名称であり変更対象外）。

## スコープ

対象ファイル（コピー変更のみ、ロジック変更なし）:

- `app/layout.tsx`
- `app/page.tsx`
- `app/matches/[id]/page.tsx`
- `app/h2h/[pair]/page.tsx`
- `app/c/[competition]/page.tsx`
- `components/premium-upsell-banner.tsx`
- `app/en/page.tsx`

## データモデル変更

なし。

## API サーフェス

なし。

## UI / コピー変更詳細

### `app/layout.tsx`

```
"...AI日本語レビューを提供するラグビーファン向けサービス。"
```
→
```
"...日本語レビュー・解説を提供するラグビーファン向けサービス。"
```

### `app/page.tsx`

| 変更前 | 変更後 |
|--------|--------|
| `"...AI日本語レビューを毎節お届け。..."` | `"...日本語レビューを毎節お届け。..."` |
| `title: { absolute: "海外ラグビー 試合結果・順位・日本語AIレビュー | Tryline" }` | `title: { absolute: "海外ラグビー 試合結果・順位・日本語レビュー | Tryline" }` |
| `"AI Rugby Analysis in Japanese"` | `"Rugby Analysis in Japanese"` |
| `"...世界のラグビーを AI 日本語レビューと試合チャットで深く追えます。"` | `"...世界のラグビーを日本語レビューと試合チャットで深く追えます。"` |
| `"AI レビューのサンプル"` | `"レビューのサンプル"` |

### `app/matches/[id]/page.tsx`

```
"...の試合結果・AI日本語レビュー。"
```
→
```
"...の試合結果・日本語レビュー。"
```
（同パターンが複数行あるので全て統一）

### `app/h2h/[pair]/page.tsx`

```
"...AI日本語レビューへのリンク。"
```
→
```
"...日本語レビューへのリンク。"
```

### `app/c/[competition]/page.tsx`

```
"...AI日本語レビュー一覧。"
```
→
```
"...日本語レビュー一覧。"
```

### `components/premium-upsell-banner.tsx`

```
"AI 日本語レビューを全文読むには Premium が必要です"
```
→
```
"日本語レビュー全文は Premium でお読みいただけます"
```

### `app/en/page.tsx`

```
"AI-generated match previews & recaps..."
```
→
```
"Match previews & recaps..."
```

## 変更ファイルまとめ

| ファイル | 変更内容 |
|----------|---------|
| `app/layout.tsx` | meta description の "AI日本語レビュー" → "日本語レビュー・解説" |
| `app/page.tsx` | title / OGP / hero コピー / section ラベルの "AI" 除去（5箇所） |
| `app/matches/[id]/page.tsx` | meta description の "AI日本語レビュー" → "日本語レビュー"（複数行） |
| `app/h2h/[pair]/page.tsx` | meta description の "AI日本語レビュー" → "日本語レビュー" |
| `app/c/[competition]/page.tsx` | meta description の "AI日本語レビュー" → "日本語レビュー" |
| `components/premium-upsell-banner.tsx` | upsell 文言の "AI 日本語レビュー" → "日本語レビュー全文" |
| `app/en/page.tsx` | "AI-generated" → 除去 |

## 受け入れ条件

1. 上記7ファイルに "AI解説"/"AI日本語レビュー"/"AI Rugby Analysis"/"AI レビュー"/"AI-generated" が残っていない
2. `components/match-chat.tsx` の "AI CHAT"/"AI チャット" および `sample-recap-cta.tsx` の "試合 AI チャット" は変更されていない
3. 各ページの `<title>` / OGP `og:description` に "AI" が露出していない（Chrome DevTools で確認）
4. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
