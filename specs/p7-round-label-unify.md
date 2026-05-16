# ラウンド表記の日本語統一

## 背景

大会ページ（`/c/...`）と試合詳細ページで、ラウンド見出しが
Premiership/URC では「ROUND 1」（英語大文字）、
Six Nations/Rugby Championship では「第N節」（日本語）と
競技によってバラバラになっている。

日本語ユーザー向けアプリとして「第N節」に統一する。

## スコープ

対象:
- `components/round-heading.tsx` — 大会ページのラウンド見出し
- `lib/format/round-label.ts` — `p7-round0-label-match-detail` で作成済みの関数を拡張
- `app/matches/[id]/page.tsx` — パンくずの Round 表示
- `components/match-header.tsx` — ヘッダーサブタイトルの Round 表示

対象外:
- 週別グルーピング（`type === "week"`）の「第N節 - 日付」形式は変更しない
- `round === 0` の「プレーオフ予選」表示は `p7-round0-label-match-detail` で対応済み

## 変更内容

### 1. `lib/format/round-label.ts` の関数を更新

`p7-round0-label-match-detail` でこのファイルが作成済みの場合は以下に差し替える:

```ts
export function formatRoundLabel(round: number): string {
  if (round === 0) return "プレーオフ予選";
  return `第${round}節`;
}
```

### 2. `components/round-heading.tsx`（L26-28付近）

変更前:
```tsx
: groupKey.round === 0
  ? "プレーオフ予選"
  : `Round ${groupKey.round}`;
```

変更後:
```tsx
import { formatRoundLabel } from "@/lib/format/round-label";
// ...
: formatRoundLabel(groupKey.round);
```

`round === 0` の分岐は `formatRoundLabel` 内に移譲し、この箇所から削除する。

## 受け入れ条件

- [ ] Premiership 大会ページのラウンド見出しが「第1節」「第2節」... と表示される
- [ ] URC 大会ページも同様に「第N節」
- [ ] Six Nations・Rugby Championship の「第N節 - 日付」形式は変わらない
- [ ] 試合詳細のパンくず・ヘッダーも「第N節」と表示される
- [ ] `round === 0` は引き続き「プレーオフ予選」
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 注意

`p7-round0-label-match-detail` を先にマージすること。
`lib/format/round-label.ts` が存在する前提で実装する。
