# Codex Prompt: 絵文字フラグ → SVG 国旗インライン化

## 前提

`p2-ui-team-stripe-border.md` が完了済み。
`lib/format/team-identity.ts` に `getTeamFlag`（絵文字）・`getTeamColor`・`getTeamStripe` が実装済み。

---

## 背景

現在の `getTeamFlag` は絵文字を返している。サブディビジョンフラグ（England 🏴󠁧󠁢󠁥󠁮󠁧󠁿、Scotland 🏴󠁧󠁢󠁳󠁣󠁴󠁿、Wales 🏴󠁧󠁢󠁷󠁬󠁳󠁿）は OS やブラウザで
表示品質が不安定で、通常の国旗絵文字（🇫🇷🇮🇪🇮🇹）と並ぶと不揃いになる。
npm パッケージに依存せず 6 チーム分の SVG を直接インライン化することで
表示の一貫性を確保する。

SVG データの出典: `country-flag-icons` パッケージ (MIT License, catamphetamine)

---

## 変更対象ファイル

- `lib/format/team-identity.ts`
- `components/flag-icon.tsx`（新規作成）
- `components/match-card.tsx`
- `components/match-header.tsx`
- `tests/components/match-card.test.tsx`
- `tests/components/match-header.test.tsx`

---

## Task 1 — `lib/format/team-identity.ts`：SVG string データと関数を追加

### 追加するデータ

`TEAM_IDENTITY` の定義の前に以下を追加する。
`getTeamFlag`（絵文字）は **削除しない**（既存テストが参照している可能性があるため）。

```typescript
const TEAM_FLAGS: Record<string, string> = {
  england: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 513 342"><path fill="#FFF" d="M0 0h513v342H0z"/><path fill="#D80027" d="M0 136h513v70H0z"/><path fill="#D80027" d="M221.5 0h70v342h-70z"/></svg>',
  scotland: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 513 342"><path fill="#005EB8" d="M0 0h513v342H0z"/><path fill="#FFF" d="M0 302.1V342h59.9l196.6-131.1L453.1 342H513v-39.9L316.4 171 513 39.9V0h-59.9L256.5 131.1 59.9 0H0v39.9L196.7 171z"/></svg>',
  wales: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 513 342"><path fill="#FFF" d="M0 0h513v171H0z"/><path fill="#529E3C" d="M0 171h513v171H0z"/><path fill="#D11C1C" d="m201 259.8 28.2-4.8-21.8-10.3 14.9-8.4s25.2 21.2 25.2 14.4c0-7.3 23.7-4.1 22.7-14.4-1.3-14.1-26.2-1-30.6-18.7-2.5-9.9-10.3-8.6-10.3-8.6l-25.1 8.6-12.5 18.7-6.2-18.7s-14.6 11.9-19.5 18.7c-5.2 7.3-10.7 23.5-10.7 23.5l25.6 10.7-37.3-6.6-27.2 6.6-16.7 4.6 7.3-7.7-15-7.6 15-9-7.3-6.1 32.3 6.1s11.8-1.2 16.3-6.1c5.6-6.2 10.1-27.1 10.1-27.1l-14.8-8.6-11.6 21s-8-19.9-15.6-31c-5.7-8.3-24.3-27.3-24.3-27.3l-24 12.6 13.4-26.7s10.6-9.3 3.9-18.8c-6.8-9.5-12.4-30.9-12.4-30.9s14.1 24.4 19.2 22.5c7.2-2.7-9-25 0-28.9 6.5-2.9 7.6 25.5 7.6 25.5l7.3-13.9v17.3s-4.3 20.7 3 33c7.2 12.3 28.7 20.9 28.7 20.9s-5.6-12.3 0-36c3.8-16 17.2-43.4 23.6-52.1 3.3-4.6-26.7 17-26.7 17v-17l-28.6-2.9-7.3 8.3-18.3-30L104 83.1h34.6l-6.7-8.3H104s5.9-12.1 34.6-12.1l13.6-9.2s18.6.5 29 .9c9.3.4 26.1-11.5 26.1-11.5l4.7 11.5-11 17.3 11.1 11.4-4.7 7 8.1 11.5H201l11.1 17.9-11.1-6.3 6.4 17.3-6.4 17.8 28.2-9.5s0-25.6 10.3-37.2C271.1 69.2 322.6 43 322.6 43s-2.7 23.5 4.9 25.4c11.1 2.7 59.4-19.4 59.4-19.4s-29 31.3-23.1 34.1c3.2 1.5 8.5 7 8.5 7s-25.1 20.5-29.3 29.3c-4.2 8.8 6.1 19.4 6.1 19.4s-21.7 0-32.5 9.5c32.5 0 59.1 15.4 74.8 4 10.5-7.6-37.7-2.9-31.4-21.9 2.4-7.1 8.5-15.2 22.6-17.3s19.1 6.3 19.1 6.3l7.6-11.5h-22.4l40.6-39.6 5.3 51.1-13.7-11.4-6.2 19.2c14.6 44.6-52.8 54.1-52.8 54.1l41.6 27.8-14.8 4.2-4.2 41.7 19.1 15.5-25-6.6-49.2 11.2 9.8-15.3-20.6 4.1 13.7-13.1-13.7-6.1 17.6-4.9 22.1 15.2s11-14.2 12.2-21.7c1.3-7.8-4.8-24.2-4.8-24.2s-32.6-.7-44.1-3.5-18.2-11.9-18.2-11.9l-13.1 15.4s45.5 17.1 34.1 24.2c-2.6 1.7-15.7-3.2-15.7-3.2s-22.4 26.2-36.8 29.7c-6.5 1.6 18.3 10.7 18.3 10.7s-21.2-3.4-32-6.6c-11.3-3.4-44.4 6.6-44.4 6.6l-11-10.7zM383.9 138c3.1 0 5.7-2.6 5.7-5.7s-2.6-5.7-5.7-5.7-5.7 2.6-5.7 5.7 2.5 5.7 5.7 5.7z"/></svg>',
  france: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 513 342"><path fill="#FFF" d="M0 0h513v342H0z"/><path fill="#00318A" d="M0 0h171v342H0z"/><path fill="#D80027" d="M342 0h171v342H342z"/></svg>',
  ireland: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 513 342"><path fill="#FFF" d="M0 0h513v342H0z"/><path fill="#6DA544" d="M0 0h171v342H0z"/><path fill="#FF9811" d="M342 0h171v342H342z"/></svg>',
  italy: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 513 342"><path fill="#F4F5F0" d="M342 0H0v341.3h512V0z"/><path fill="#008C45" d="M0 0h171v342H0z"/><path fill="#CD212A" d="M342 0h171v342H342z"/></svg>',
};
```

### 追加するエクスポート関数

```typescript
export function getTeamFlagSvg(slug: string): string {
  return TEAM_FLAGS[slug] ?? "";
}
```

---

## Task 2 — `components/flag-icon.tsx`：新規コンポーネント

```tsx
import { getTeamFlagSvg } from "@/lib/format/team-identity";
import { cn } from "@/lib/utils";

type FlagIconProps = {
  slug: string;
  size?: number;
  className?: string;
};

export function FlagIcon({ slug, size = 20, className }: FlagIconProps) {
  const svg = getTeamFlagSvg(slug);

  if (!svg) {
    return <span aria-hidden>🏉</span>;
  }

  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 overflow-hidden rounded-[2px]", className)}
      dangerouslySetInnerHTML={{ __html: svg }}
      style={{ width: Math.round(size * 1.5), height: size, verticalAlign: "middle" }}
    />
  );
}
```

---

## Task 3 — `components/match-card.tsx`：絵文字フラグを `<FlagIcon>` に置き換え

### インポート変更

```tsx
// 追加
import { FlagIcon } from "./flag-icon";

// getTeamFlag のインポートを削除し getTeamStripe のみにする
import { getTeamStripe } from "@/lib/format/team-identity";
```

### チーム名表示の変更

ホームチーム（右寄せ）:

```tsx
// 変更前
<p className={cn("truncate text-base font-bold sm:text-xl", ...)}>
  {getTeamFlag(match.homeTeam.slug)} {match.homeTeam.shortCode}
</p>

// 変更後
<p className={cn("flex items-center justify-end gap-1.5 text-base font-bold sm:text-xl", ...)}>
  <FlagIcon slug={match.homeTeam.slug} size={16} />
  {match.homeTeam.shortCode}
</p>
```

アウェイチーム（左寄せ）:

```tsx
// 変更前
<p className={cn("truncate text-base font-bold sm:text-xl", ...)}>
  {match.awayTeam.shortCode} {getTeamFlag(match.awayTeam.slug)}
</p>

// 変更後
<p className={cn("flex items-center gap-1.5 text-base font-bold sm:text-xl", ...)}>
  {match.awayTeam.shortCode}
  <FlagIcon slug={match.awayTeam.slug} size={16} />
</p>
```

---

## Task 4 — `components/match-header.tsx`：絵文字フラグを `<FlagIcon>` に置き換え

### インポート変更

```tsx
// 追加
import { FlagIcon } from "./flag-icon";

// getTeamFlag のインポートを削除（getTeamColor は残す）
import { getTeamColor } from "@/lib/format/team-identity";
```

### `TeamBlock` コンポーネントの変更

`flag: string` props を `slug: string` に変更し `FlagIcon` を使う:

```tsx
function TeamBlock({
  align,
  dimmed,
  slug,
  name,
  shortCode,
}: {
  align: "left" | "right";
  dimmed: boolean;
  slug: string;
  name: string;
  shortCode: string;
}) {
  return (
    <div className={align === "right" ? "min-w-0 text-right" : "min-w-0 text-left"}>
      <p
        className={cn(
          "flex items-center gap-2 truncate text-2xl font-black tracking-tight sm:text-3xl",
          align === "right" ? "flex-row-reverse justify-start" : "flex-row",
          dimmed ? "text-slate-400" : "text-slate-900",
        )}
      >
        <FlagIcon slug={slug} size={24} />
        {shortCode}
      </p>
      <p
        className={cn(
          "mt-1 truncate text-xs font-medium leading-tight sm:text-sm",
          dimmed ? "text-slate-300" : "text-slate-400",
        )}
      >
        {name}
      </p>
    </div>
  );
}
```

### `TeamBlock` の呼び出し元を変更

```tsx
// 変更前
<TeamBlock
  align="right"
  dimmed={outcome === "away_win"}
  flag={getTeamFlag(match.homeTeam.slug)}
  name={match.homeTeam.name}
  shortCode={match.homeTeam.shortCode}
/>

// 変更後
<TeamBlock
  align="right"
  dimmed={outcome === "away_win"}
  slug={match.homeTeam.slug}
  name={match.homeTeam.name}
  shortCode={match.homeTeam.shortCode}
/>
```

アウェイチームも同様に `flag` → `slug` に変更する。

---

## Task 5 — テストの更新

`tests/components/match-card.test.tsx` と `tests/components/match-header.test.tsx` の
絵文字フラグを参照しているアサーションを、チームの shortCode または name を
参照するよう更新する。

---

## 完了条件

- [ ] 試合カードと試合詳細ヘッダーで SVG 国旗が表示される
- [ ] England（赤十字）・Scotland（青地白バツ）・Wales（緑白龍）が明確に識別できる
- [ ] `getTeamFlag`（絵文字）は削除されていない
- [ ] `FlagIcon` に不明な slug を渡すと 🏉 にフォールバックする
- [ ] `pnpm tsc --noEmit` がパスする
- [ ] `pnpm build` が成功する

## 変更しないこと

- `getTeamFlag`・`getTeamColor`・`getTeamStripe`（既存関数は削除禁止）
- カードのグリッドレイアウト構造
- `match-header.tsx` の `homeColor` グラデーション背景（`${homeColor}18`）
- ストライプボーダーの実装
