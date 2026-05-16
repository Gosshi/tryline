# 試合詳細ページの「Round 0」表示修正

## 背景

`p6-top14-round0-fix` で大会ページの Round 0 ラベルは「プレーオフ予選」に修正済みだが、
試合詳細ページ（`/matches/:id`）のパンくずリストとヘッダーサブタイトルで
「Round 0」が残っている。

再現URL: https://tryline-six.vercel.app/matches/ee82bfb7-b08c-4e66-8a70-a45c10671c78

## スコープ

対象:
- `app/matches/[id]/page.tsx` — パンくずリストの Round 表示
- `components/match-header.tsx` — ヘッダーサブタイトルの Round 表示
- `lib/format/round-label.ts` — 新規ユーティリティ（関数の一元管理）

対象外:
- `components/round-heading.tsx`（大会ページ側、p6 実装済み）

## 変更内容

### 1. `lib/format/round-label.ts` を新規作成

```ts
export function formatRoundLabel(round: number): string {
  if (round === 0) return "プレーオフ予選";
  return `Round ${round}`;
}
```

### 2. `app/matches/[id]/page.tsx`（パンくず、L164付近）

変更前:
```tsx
<li className="text-[var(--color-ink)]">Round {match.round}</li>
```

変更後:
```tsx
import { formatRoundLabel } from "@/lib/format/round-label";
// ...
<li className="text-[var(--color-ink)]">{formatRoundLabel(match.round)}</li>
```

### 3. `components/match-header.tsx`（ヘッダーサブタイトル、L65付近）

変更前:
```tsx
{match.round !== null ? ` · Round ${match.round}` : ""}
```

変更後:
```tsx
import { formatRoundLabel } from "@/lib/format/round-label";
// ...
{match.round !== null ? ` · ${formatRoundLabel(match.round)}` : ""}
```

## 受け入れ条件

- [ ] `/matches/ee82bfb7-b08c-4e66-8a70-a45c10671c78` のパンくずが「プレーオフ予選」と表示される
- [ ] 同ページのヘッダーサブタイトルが「· プレーオフ予選」と表示される
- [ ] Round 1 以上の通常試合のパンくず・ヘッダーは「Round N」のまま変わらない
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る
