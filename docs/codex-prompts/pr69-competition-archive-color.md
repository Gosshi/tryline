# PR #69 — ホーム大会アーカイブにカラーアクセントを追加

## 背景

`app/page.tsx` の「大会アーカイブ」セクションは白いカードにテキストのみで、
各大会のビジュアル的な個性がない。`getCompetitionFamilyColor()` が
`lib/format/competition.ts` にすでに存在するため、これを使って
左ボーダーに大会カラーを反映する。

## スコープ

対象:
- `app/page.tsx` の大会アーカイブセクション（`大会アーカイブ` の `<ul>` 内カードのみ）

対象外:
- カードのレイアウト・テキスト・リンク先は変更しない
- `lib/format/competition.ts` は変更しない
- 他のセクションは変更しない

## 現在の実装（変更前）

```tsx
// app/page.tsx — 大会アーカイブセクション（抜粋）
import { formatFamilyName } from "@/lib/format/competition";

<Link
  className="group flex h-full items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
  href={`/c/${competition.family}/${competition.season}`}
>
  <div>
    <span className="block font-semibold text-[var(--color-ink)]">
      {formatFamilyName(competition.family)}
    </span>
    <span className="mt-0.5 block text-xs text-[var(--color-ink-muted)]">
      {competition.season}
    </span>
  </div>
  <span className="text-sm text-[var(--color-ink-muted)] transition-colors group-hover:text-[var(--color-ink)]">
    最新シーズン →
  </span>
</Link>
```

## 変更後

### import 追加

`getCompetitionFamilyColor` を import に追加する:

```tsx
import {
  formatCompetitionTitle,
  formatFamilyName,
  getCompetitionFamilyColor, // 追加
} from "@/lib/format/competition";
```

### カードに左ボーダーカラーを適用

```tsx
<Link
  className="group flex h-full items-center justify-between rounded-xl border border-slate-200 bg-white py-4 pl-4 pr-5 transition-all duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
  href={`/c/${competition.family}/${competition.season}`}
  style={{
    borderLeftColor: getCompetitionFamilyColor(competition.family),
    borderLeftWidth: "4px",
  }}
>
  <div>
    <span className="block font-semibold text-[var(--color-ink)]">
      {formatFamilyName(competition.family)}
    </span>
    <span className="mt-0.5 block text-xs text-[var(--color-ink-muted)]">
      {competition.season}
    </span>
  </div>
  <span className="text-sm text-[var(--color-ink-muted)] transition-colors group-hover:text-[var(--color-ink)]">
    最新シーズン →
  </span>
</Link>
```

### 変更のポイント

- `border-l-4` の代わりに `style={{ borderLeftColor, borderLeftWidth }}` を使う — Tailwind の任意値よりインライン CSS の方が動的カラーに適している
- `px-5` → `pl-4 pr-5` に変更してボーダー分の左余白を調整
- 既存の `border border-slate-200` はそのまま残す（上下右のボーダーを維持）

### 大会カラーの参照値（`lib/format/competition.ts` より）

| family | color |
|--------|-------|
| six-nations | #001489 |
| premiership | #1C2C6B |
| urc | #00823E |
| top-14 | #D62B31 |
| super-rugby-pacific | #0057B8 |
| rugby-championship | #C8102E |
| autumn-nations | #2D2D2D |
| league-one | #FF6B00 |
| pnc | #00539B |

## 完了の定義

- [ ] 大会アーカイブの各カード左端に大会固有の色のボーダーが表示される
- [ ] カードのレイアウト・テキスト・hover 挙動は変わらない
- [ ] TypeScript エラーなし・`pnpm build` 通過
