# fix: 得点経過の時間ズレ・大会名重複・日時折り返しを修正（3 項目）

## 目的

UI レビューで発見した 3 件の表示バグを修正する。
機能変更はなし。レイアウト・フォーマットの修正のみ。

**必ず `design.md` を最初に読んでから実装すること。**

---

## 修正項目

### 1. 得点経過の時間が縦方向でズレる

**ファイル**: `components/match-events-section.tsx`

**原因**: grid コンテナの `div` に `paddingLeft: "8px"` (home) または
`paddingRight: "8px"` (away) をインラインスタイルで設定しているため、
グリッド全体が行ごとに左右へシフトし、中央の時間列が縦に揃わない。

**修正**: `div` の `style` prop を削除し、border と padding を
対応する左右の `span` 要素へ移す。グリッドコンテナにはパディングを付けない。

```tsx
// 変更前
<div
  className="grid grid-cols-[1fr_2.5rem_1fr] items-center gap-2 rounded py-1.5 hover:bg-slate-50/80"
  key={event.id}
  style={
    isHome
      ? { borderLeft: `3px solid ${teamColor}`, paddingLeft: "8px" }
      : { borderRight: `3px solid ${teamColor}`, paddingRight: "8px" }
  }
>
  <span
    className="min-w-0 truncate text-xs text-[var(--color-ink)] sm:text-sm"
    title={isHome ? label : ""}
  >
    {isHome ? label : ""}
  </span>
  <span className="text-center text-xs font-semibold tabular-nums text-[var(--color-ink-muted)]">
    {event.minute !== null ? `${event.minute}'` : "—"}
  </span>
  <span
    className="min-w-0 truncate text-right text-xs text-[var(--color-ink)] sm:text-sm"
    title={!isHome ? label : ""}
  >
    {!isHome ? label : ""}
  </span>
</div>

// 変更後
<div
  className="grid grid-cols-[1fr_2.5rem_1fr] items-center gap-2 rounded py-1.5 hover:bg-slate-50/80"
  key={event.id}
>
  <span
    className="min-w-0 truncate text-xs text-[var(--color-ink)] sm:text-sm"
    style={isHome ? { borderLeft: `3px solid ${teamColor}`, paddingLeft: "8px" } : undefined}
    title={isHome ? label : ""}
  >
    {isHome ? label : ""}
  </span>
  <span className="text-center text-xs font-semibold tabular-nums text-[var(--color-ink-muted)]">
    {event.minute !== null ? `${event.minute}'` : "—"}
  </span>
  <span
    className="min-w-0 truncate text-right text-xs text-[var(--color-ink)] sm:text-sm"
    style={!isHome ? { borderRight: `3px solid ${teamColor}`, paddingRight: "8px" } : undefined}
    title={!isHome ? label : ""}
  >
    {!isHome ? label : ""}
  </span>
</div>
```

---

### 2. 「最近のレビュー」の大会名にシーズンが重複する

**ファイル**: `app/page.tsx`

`competition.name` が「Top 14 2024-25」のようにシーズンを含むケースがあり、
`{match.competition.name} {match.competition.season}` と書くと
「Top 14 2024-25 2024-25」と重複表示される。

`formatCompetitionTitle` は既に `app/page.tsx` に import 済みなので、それを使う。

```tsx
// 変更前（最近のレビューセクション内の competition 表示行）
<p className="text-xs text-[var(--color-ink-muted)]">
  {match.competition.name} {match.competition.season}
</p>

// 変更後
<p className="text-xs text-[var(--color-ink-muted)]">
  {formatCompetitionTitle(match.competition.name, match.competition.season)}
</p>
```

---

### 3. 「今後の試合」の日時が不規則に折り返される

**ファイル**: `lib/format/kickoff.ts` および `app/page.tsx`

`formatKickoffJst` が返す「2027-02-06 (土) 05:10 JST」は `w-32` コンテナ内で
不規則に折り返し、2 行になる表示が崩れて見える。

日付と時刻を別々に返す 2 つの関数を追加し、整然とした 2 行表示にする。

**`lib/format/kickoff.ts` に追加する関数**
（`getFormatterParts` は既存の private 関数をそのまま利用）:

```ts
export function formatKickoffJstDate(kickoffAtUtc: string): string {
  const parts = getFormatterParts(kickoffAtUtc, {
    locale: "ja-JP",
    timeZone: "Asia/Tokyo",
  });
  return `${parts.year}-${parts.month}-${parts.day} (${parts.weekday})`;
}

export function formatKickoffJstTime(kickoffAtUtc: string): string {
  const parts = getFormatterParts(kickoffAtUtc, {
    locale: "ja-JP",
    timeZone: "Asia/Tokyo",
  });
  return `${parts.hour}:${parts.minute} JST`;
}
```

**`app/page.tsx` のインポート変更**:

```ts
// 変更前
import { formatKickoffJst } from "@/lib/format/kickoff";

// 変更後
import {
  formatKickoffJstDate,
  formatKickoffJstTime,
} from "@/lib/format/kickoff";
```

`formatKickoffJst` は `components/match-header.tsx` で引き続き使用されるため
`lib/format/kickoff.ts` からは削除しないこと。

**`app/page.tsx` の今後の試合リストアイテム表示変更**:

```tsx
// 変更前
<div className="shrink-0 sm:w-32">
  <time
    className="text-xs font-semibold tabular-nums text-[var(--color-accent)]"
    dateTime={match.kickoffAt}
  >
    {formatKickoffJst(match.kickoffAt)}
  </time>
</div>

// 変更後
<div className="shrink-0 sm:w-36">
  <time dateTime={match.kickoffAt}>
    <p className="text-xs font-semibold tabular-nums text-[var(--color-accent)]">
      {formatKickoffJstDate(match.kickoffAt)}
    </p>
    <p className="text-xs tabular-nums text-[var(--color-ink-muted)]">
      {formatKickoffJstTime(match.kickoffAt)}
    </p>
  </time>
</div>
```

---

## 変更するファイル

- `components/match-events-section.tsx`
- `lib/format/kickoff.ts`
- `app/page.tsx`

## 変更しないこと

- `components/match-header.tsx`（`formatKickoffJst` を使い続ける）
- `app/globals.css`
- `tailwind.config.ts`
- `design.md`（参照するだけ）
- データクエリ・型定義・コンポーネント構造

## 完了条件

- `pnpm tsc --noEmit` パス
- `pnpm build` 成功
- 得点経過の時間列がすべての行で縦方向に揃っていること
- 「最近のレビュー」の大会名が「Top 14 2024-25」のように重複なく表示されること
- 「今後の試合」の日時が「2027-02-06 (土)」と「05:10 JST」の整然とした 2 行で表示されること

## ブランチ・PR

- ブランチ: `fix/ui-timeline-and-display-fixes`
- PR タイトル: `Fix: scoring timeline alignment, competition name dedup, upcoming match datetime layout`
