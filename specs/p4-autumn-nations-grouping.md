# Autumn Nations「節未定」→ 日付週別グルーピング

## 背景

Autumn Nations（秋の国際マッチウィーク）には公式な「ラウンド」が存在しない。
試合は毎年 10〜11 月の 3〜4 つのマッチウィーク（土日）に分散して開催される。

`groupMatchesByRound` は `match.round`（`number | null`）でグループ化するため、
Autumn Nations 全試合は `round = null` → `<RoundHeading round={null} />` → 「節未定」と表示される。

「節未定」はラウンド制大会（URC・Premiership 等）でデータ未設定の場合に表示する想定のラベルで、
Autumn Nations のような週次開催大会には意味的に合わない。

### 週別グルーピングの方針

`match.kickoffAt` から ISO 週番号を取得して週単位でグループ化し、
「第1節 — 11月2日〜3日」のような表示にする。

## スコープ

対象:
- `app/c/[competition]/[season]/page.tsx` — `groupMatchesByRound` を週別グルーピングに対応するよう拡張
- `components/round-heading.tsx` — 週別見出し表示を追加

対象外:
- `lib/db/queries/matches.ts`（クエリ・フィールド変更なし）
- `matches.round` カラム（変更なし。Autumn Nations は引き続き null のまま）
- Six Nations・URC・Premiership 等の既存ラウンド表示（変更なし）

## 実装

### 型定義

`page.tsx` 内（またはエクスポートして `round-heading.tsx` から import）で定義する:

```ts
type RoundGroupKey = { type: "round"; round: number | null };
type WeekGroupKey  = { type: "week"; weekIndex: number; startDate: string; endDate: string };
type GroupKey = RoundGroupKey | WeekGroupKey;
```

### 1. `app/c/[competition]/[season]/page.tsx` — グルーピング関数の拡張

```ts
function getIsoWeek(isoDateStr: string): number {
  // isoDateStr は "YYYY-MM-DD" または ISO 8601 文字列
  const date = new Date(isoDateStr);
  const day = date.getUTCDay() || 7;
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  return Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function groupMatchesByWeek(
  matches: Awaited<ReturnType<typeof listMatchesForCompetition>>,
): [WeekGroupKey, typeof matches][] {
  const grouped = new Map<number, typeof matches>();

  for (const match of matches) {
    const week = getIsoWeek(match.kickoffAt);
    grouped.set(week, [...(grouped.get(week) ?? []), match]);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a - b)
    .map(([isoWeek, weekMatches], index) => {
      const dates = weekMatches.map((m) => m.kickoffAt.slice(0, 10)).sort();
      return [
        {
          type: "week" as const,
          weekIndex: index + 1,
          startDate: dates[0]!,
          endDate: dates[dates.length - 1]!,
        },
        weekMatches,
      ];
    });
}

function groupMatchesByRound(
  matches: Awaited<ReturnType<typeof listMatchesForCompetition>>,
): [GroupKey, typeof matches][] {
  // 全試合が round = null の場合は週別グルーピングに切り替え
  const hasAnyRound = matches.some((m) => m.round !== null);
  if (!hasAnyRound && matches.length > 0) {
    return groupMatchesByWeek(matches);
  }

  const grouped = new Map<number | null, typeof matches>();
  for (const match of matches) {
    grouped.set(match.round, [...(grouped.get(match.round) ?? []), match]);
  }

  return [...grouped.entries()]
    .sort(([l], [r]) => {
      if (l === null) return 1;
      if (r === null) return -1;
      return l - r;
    })
    .map(([round, m]) => [{ type: "round" as const, round }, m]);
}
```

### 2. `app/c/[competition]/[season]/page.tsx` — JSX の更新

```tsx
{groupedMatches.map(([key, roundMatches]) => (
  <section
    className="space-y-4"
    key={key.type === "round" ? (key.round ?? "unassigned") : `week-${key.weekIndex}`}
  >
    <RoundHeading groupKey={key} />
    <div className="grid gap-4 md:grid-cols-2">
      {roundMatches.map((match) => (
        <MatchCard
          contentStatus={contentStatusMap.get(match.id) ?? { hasPreview: false, hasRecap: false }}
          key={match.id}
          match={match}
        />
      ))}
    </div>
  </section>
))}
```

### 3. `components/round-heading.tsx` — 週別見出しの追加

```tsx
import type { GroupKey } from "@/app/c/[competition]/[season]/page";

interface RoundHeadingProps {
  groupKey: GroupKey;
}

function formatDateShort(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
  }).format(date);
}

export function RoundHeading({ groupKey }: RoundHeadingProps) {
  if (groupKey.type === "week") {
    const { weekIndex, startDate, endDate } = groupKey;
    const dateLabel =
      startDate === endDate
        ? formatDateShort(startDate)
        : `${formatDateShort(startDate)}〜${formatDateShort(endDate)}`;

    return (
      <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">
        第{weekIndex}節 — {dateLabel}
      </h2>
    );
  }

  const { round } = groupKey;
  return (
    <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">
      {round === null ? "節未定" : `Round ${round}`}
    </h2>
  );
}
```

**注**: `GroupKey` 型を `page.tsx` からエクスポートすると Next.js の Server Component 制約に引っかかる場合がある。
その場合は `lib/types/competition.ts` のような共有ファイルに移動して両ファイルから import すること。

## 変更ファイル

- `app/c/[competition]/[season]/page.tsx`（`groupMatchesByRound` の拡張・JSX 更新）
- `components/round-heading.tsx`（`GroupKey` props と週別見出し追加）

## 受け入れ条件

- [ ] Autumn Nations の大会ページを開くと「節未定」が表示されず、「第1節 — 11月2日〜3日」形式の週別見出しでグループ化される
- [ ] Six Nations・URC・Premiership 等のラウンドあり大会では従来の `Round N` 表示のまま変化なし
- [ ] 一部 `round = null` の試合が混在するラウンドあり大会では、末尾に「節未定」グループが引き続き表示される
- [ ] モバイル（375px）・デスクトップでレイアウトが崩れない
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

1. DB の `competitions.slug` で Autumn Nations の正確な slug を確認する（例: `"autumn-nations-2025"` か `"autumn-internationals-2025"` か）
2. `match.kickoffAt` のタイムゾーン（UTC か JST か）を確認する。UTC の場合、日本時間に変換して日付を計算すべきかどうか判断する
3. `GroupKey` 型の定義位置（`page.tsx` 内エクスポート vs `lib/types/competition.ts`）は Codex が確認して判断する
