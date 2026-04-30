# Codex プロンプト: タイトル重複バグ修正 + 日付フォーマット改善

## 修正 1: コンペティション名の「2025 2025」重複を解消

### 原因

`competitions.name` = `"Six Nations 2025"`、`competitions.season` = `"2025"` となっており、
UI で両方を並べて表示しているため「Six Nations 2025 2025」になっている。

### ヘルパー関数（`lib/format/competition.ts` として新規作成）

```typescript
export function formatCompetitionTitle(name: string, season: string): string {
  return name.includes(season) ? name : `${name} ${season}`;
}
```

### 修正箇所 1: `app/page.tsx`

`<h1>` 内の表示を以下に変更する:

```tsx
import { formatCompetitionTitle } from "@/lib/format/competition";

// <h1> の中
<h1 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
  {formatCompetitionTitle(competition.name, competition.season)}
</h1>
```

season が name に含まれる場合は `<span>` で重ねて表示しない。
season が name に含まれない場合は同じ `<h1>` 内にスペース区切りで並べる。

### 修正箇所 2: `components/match-header.tsx`

現在:
```tsx
{match.competition.name} {match.competition.season}
{match.round !== null ? ` · Round ${match.round}` : ""}
```

修正後:
```tsx
import { formatCompetitionTitle } from "@/lib/format/competition";

{formatCompetitionTitle(match.competition.name, match.competition.season)}
{match.round !== null ? ` · Round ${match.round}` : ""}
```

---

## 修正 2: 日付フォーマットを日本語表記に

### 原因

`formatDateRange` が ISO 文字列をそのまま結合しているため「2025-01-31 〜 2025-03-15」と表示される。

### 修正箇所: `app/page.tsx` の `formatDateRange`

```typescript
function formatDateJa(dateStr: string): string {
  // "2025-01-31" → "2025年1月31日"
  const date = new Date(`${dateStr}T00:00:00`);
  return new Intl.DateTimeFormat("ja-JP", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDateRange(startDate: string | null, endDate: string | null): string | null {
  if (!startDate && !endDate) return null;
  return [startDate, endDate]
    .filter((d): d is string => d !== null)
    .map(formatDateJa)
    .join(" 〜 ");
}
```

表示結果: `2025年1月31日 〜 2025年3月15日`

---

## 変更するファイル一覧

| ファイル | 変更内容 |
|---|---|
| `lib/format/competition.ts` | 新規作成: `formatCompetitionTitle` |
| `app/page.tsx` | `formatCompetitionTitle` を使用、`formatDateRange` を日本語化 |
| `components/match-header.tsx` | `formatCompetitionTitle` を使用 |

## 完了条件

- `pnpm tsc --noEmit` がエラーなし
- ホームページ見出しが「Six Nations 2025」（「2025」が一度だけ）
- 試合詳細ヘッダーが「SIX NATIONS 2025 · ROUND 1」
- 開催期間が「2025年1月31日 〜 2025年3月15日」と表示される
