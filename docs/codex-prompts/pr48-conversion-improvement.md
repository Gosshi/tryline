# PR48: コンバージョン改善

## 背景

料金ページと試合ページのペイウォール周辺のCTAを改善し、無料→有料の転換率を上げる。

## スコープ

対象:
- `app/pricing/page.tsx`
- `components/match-content.tsx`
- `components/match-content-section.tsx`

対象外:
- `components/paywall.tsx`（AI チャット用。現状のまま）
- 決済フロー・バックエンド

---

## 変更詳細

### 1. `app/pricing/page.tsx`

#### 1-1. ヒーローに数値バッジを追加

`<p className="mt-5 ...">` の直前に、横並びのバッジ行を追加する。

```tsx
<div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/60">
  <span>8大会対応</span>
  <span>500試合以上</span>
  <span>AI日本語解説</span>
</div>
```

#### 1-2. FAQ を拡充（2問追加）

既存の `faqs` 配列の先頭に以下を追加する。

```ts
{
  question: "無料でどこまで利用できますか？",
  answer:
    "試合スコア・順位表・ラインナップ・Web プッシュ通知は無料でご利用いただけます。AI 日本語プレビュー・レビューは冒頭 300 文字まで無料で読めます。全文・AI チャットは Premium 限定です。",
},
{
  question: "返金ポリシーを教えてください。",
  answer:
    "デジタルコンテンツの性質上、原則として返金は承っておりません。ご不明な点は support@trylinerugby.com までお問い合わせください。",
},
```

#### 1-3. features 配列の文言を微修正

| 変更前 | 変更後 |
|--------|--------|
| `"試合スコア・順位表"` | `"試合スコア・順位表・得点推移グラフ"` |

---

### 2. `components/match-content.tsx`

#### 2-1. `matchTitle` prop を追加

```ts
type MatchContentProps = {
  content: PublishedMatchContent;
  contentType: "preview" | "recap";
  isPremium: boolean;
  matchTitle?: string;   // 追加
  showCta?: boolean;
};
```

#### 2-2. ロック時 CTA の文言を試合固有化

`isLocked && showCta` のブロック内を以下に置き換える:

```tsx
<div className="mt-4 flex flex-col items-center gap-3 text-center">
  <p className="text-sm font-semibold text-slate-800">
    {matchTitle
      ? `${matchTitle} の続きを読む`
      : "続きは Premium でご覧いただけます"}
  </p>
  <a
    className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
    href="/pricing"
  >
    {matchTitle ? "Premium で全文を読む — ¥980/月" : "Premium で全文を読む"}
  </a>
</div>
```

---

### 3. `components/match-content-section.tsx`

`matchTitle` を `MatchContent` に渡す。`MatchContentSectionProps` への prop 追加は不要。既に `match` を受け取っているので、そこから組み立てる。

```tsx
<MatchContent
  content={content}
  contentType={contentType}
  isPremium={isPremium}
  matchTitle={`${match.homeTeam.name} vs ${match.awayTeam.name}`}
  showCta={showCta}
/>
```

---

## 受け入れ条件

- 料金ページのヒーローに「8大会対応」「500試合以上」「AI日本語解説」が表示される
- FAQ が 5問になっている（無料の範囲・返金ポリシーが追加）
- 試合詳細ページのレビュー/プレビューのロック時CTA に「[ホーム] vs [アウェー] の続きを読む」が表示される
- `matchTitle` が渡されない場合は「続きは Premium でご覧いただけます」のフォールバックが表示される
- `pnpm build` でエラーなし

## 参考ファイル

- `components/match-content.tsx` — CTA の変更対象（`isLocked && showCta` ブロック、283行目付近）
- `components/match-content-section.tsx` — `matchTitle` を渡す箇所（44行目付近）
- `app/pricing/page.tsx` — features / faqs 配列・ヒーロー
