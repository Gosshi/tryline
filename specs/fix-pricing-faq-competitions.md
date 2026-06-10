# fix-pricing-faq-competitions

## 背景

PMF 監査（2026-06-10）で pricing ページの FAQ「どの大会のコンテンツが読めますか？」の回答が不完全と指摘された。

現状の回答:
> Six Nations、Premiership、URC、Top 14、Super Rugby Pacific、Rugby Championship、Autumn Nations Series に対応しています。

コードベース上の competition family は以下の 10:
`autumn-nations`, `league-one`, `pnc`, `premiership`, `rugby-championship`, `rwc`, `six-nations`, `super-rugby-pacific`, `top-14`, `urc`

League One、PNC（Pacific Nations Cup）、RWC 2027 の 3 大会が回答から抜けており、「8大会対応」バッジも実態と合っていない。

## スコープ

対象:
- `app/pricing/page.tsx`
  - `faqs` 配列内「どの大会のコンテンツが読めますか？」の `answer` 文字列
  - Hero バッジ「8大会対応」の数字（実際の大会数に更新）
  - JSON-LD の FAQPage `acceptedAnswer` は `faqs` 配列から自動生成されるため別途変更不要

対象外:
- 大会ページ自体の変更

## データモデル変更

なし。

## API サーフェス

なし。

## UI サーフェス

### FAQ 回答（`app/pricing/page.tsx` L60-61付近）

```tsx
// 変更前
answer:
  "Six Nations、Premiership、URC、Top 14、Super Rugby Pacific、Rugby Championship、Autumn Nations Series に対応しています。",

// 変更後
answer:
  "Six Nations、Premiership、URC、Top 14、Super Rugby Pacific、Rugby Championship、Autumn Nations Series、リーグワン、Pacific Nations Cup、RWC 2027 に対応しています。",
```

### バッジ（`app/pricing/page.tsx` L136付近）

```tsx
// 変更前
<span>8大会対応</span>

// 変更後
<span>10大会対応</span>
```

## LLM 連携

なし。

## 受け入れ条件

1. `/pricing` ページの FAQ に League One、PNC、RWC 2027 が明記されている
2. `10大会対応` バッジが表示される
3. JSON-LD（FAQPage）の `acceptedAnswer` に変更後の文字列が反映されている
4. ビルド・TypeScript エラーなし

## 未解決の質問

- RWC 2027 はコンテンツが存在しない大会。「対応予定」と注記すべきか否かは Owner 判断。
  今回は「対応しています」の表記に含めるが、違和感があれば別 spec で調整する。
