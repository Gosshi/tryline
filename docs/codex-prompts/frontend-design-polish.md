# Codex プロンプト: デザインポリッシュ（チームカラー・国旗・背景・コンテンツセクション）

## タスク 5: チームカラー・国旗の追加

### `lib/format/team-identity.ts`（新規作成）

Six Nations 全チームの国旗絵文字を定義する。

```typescript
type TeamIdentity = {
  flag: string;
};

const TEAM_IDENTITY: Record<string, TeamIdentity> = {
  england: { flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  france: { flag: "🇫🇷" },
  ireland: { flag: "🇮🇪" },
  italy: { flag: "🇮🇹" },
  scotland: { flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
  wales: { flag: "🏴󠁧󠁢󠁷󠁬󠁳󠁿" },
};

export function getTeamFlag(slug: string): string {
  return TEAM_IDENTITY[slug]?.flag ?? "🏉";
}
```

### `components/match-card.tsx` に国旗を追加

```tsx
import { getTeamFlag } from "@/lib/format/team-identity";

// ホームチーム（右揃え）
<div className="text-right">
  <p className="text-xl font-bold text-slate-900">
    {getTeamFlag(match.homeTeam.slug)} {match.homeTeam.shortCode}
  </p>
  <p className="text-xs leading-tight text-slate-400">{match.homeTeam.name}</p>
</div>

// アウェイチーム（左揃え）
<div className="text-left">
  <p className="text-xl font-bold text-slate-900">
    {match.awayTeam.shortCode} {getTeamFlag(match.awayTeam.slug)}
  </p>
  <p className="text-xs leading-tight text-slate-400">{match.awayTeam.name}</p>
</div>
```

### `components/match-header.tsx` に国旗を追加

`TeamBlock` に `flag: string` prop を追加する。

```tsx
import { getTeamFlag } from "@/lib/format/team-identity";

<TeamBlock
  align="right"
  flag={getTeamFlag(match.homeTeam.slug)}
  name={match.homeTeam.name}
  shortCode={match.homeTeam.shortCode}
  dimmed={outcome === "away_win"}
/>
<TeamBlock
  align="left"
  flag={getTeamFlag(match.awayTeam.slug)}
  name={match.awayTeam.name}
  shortCode={match.awayTeam.shortCode}
  dimmed={outcome === "home_win"}
/>
```

`TeamBlock` 内の shortCode 表示:
```tsx
<p className="truncate text-2xl font-black tracking-tight sm:text-3xl">
  {align === "right" ? `${flag} ${shortCode}` : `${shortCode} ${flag}`}
</p>
```

> **注意**: `match-header.tsx` に `getOutcome` と `dimmed` が未実装の場合は、`frontend-match-visuals.md` のタスク6を先に実装してから本タスクを実施すること。

---

## タスク 4: コンテンツセクションのデザイン整理

### `components/match-content-section.tsx` を更新

shadcn の `Card` を廃止し、他のセクション（`MatchEventsSection` 等）と統一したスタイルに変更する。

```tsx
import { ContentPlaceholder } from "@/components/content-placeholder";
import { MatchContent } from "@/components/match-content";
import { deriveContentState } from "@/lib/match-content/state";

import type { PublishedMatchContent } from "@/lib/db/queries/match-content";
import type { MatchDetail } from "@/lib/db/queries/matches";

type MatchContentSectionProps = {
  contentType: "preview" | "recap";
  content: PublishedMatchContent | null;
  match: MatchDetail;
};

const TITLES = {
  preview: "プレビュー",
  recap: "レビュー",
} as const;

const SUBTITLES = {
  preview: "Match Preview",
  recap: "Match Review",
} as const;

export function MatchContentSection({ content, contentType, match }: MatchContentSectionProps) {
  const state = deriveContentState({
    contentType,
    kickoffAt: new Date(match.kickoffAt),
    matchStatus: match.status,
    now: new Date(),
  });

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-4 border-b border-slate-100 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          {SUBTITLES[contentType]}
        </p>
        <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-950">
          {TITLES[contentType]}
        </h2>
      </div>

      {content ? (
        <MatchContent content={content} contentType={contentType} />
      ) : (
        <ContentPlaceholder state={state} type={contentType} />
      )}
    </section>
  );
}
```

shadcn の `Card`, `CardContent`, `CardHeader`, `CardTitle` のインポートをすべて削除する。

---

## タスク 10: 背景・余白の整理

### `app/globals.css`: body に bg-slate-50 を追加

```css
body {
  @apply bg-slate-50 text-foreground;
  font-family:
    "Hiragino Sans",
    "Noto Sans JP",
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}
```

（現在は `bg-background text-foreground` — `bg-background` は `hsl(210 40% 98%)` でほぼ白のため、`bg-slate-50` に統一してページとナビの背景差をなくす）

### `app/layout.tsx`: body に min-h-screen を追加

```tsx
<body className="min-h-screen">
  <SiteHeader />
  {children}
</body>
```

### `app/page.tsx`: ラウンドセクション間隔を広げる

```tsx
// 変更前
<div className="mx-auto flex w-full max-w-6xl flex-col gap-8 ...">

// 変更後
<div className="mx-auto flex w-full max-w-6xl flex-col gap-10 ...">
```

---

## 変更するファイル一覧

| ファイル | 変更内容 |
|---|---|
| `lib/format/team-identity.ts` | 新規作成: `getTeamFlag` |
| `components/match-card.tsx` | 国旗絵文字を追加 |
| `components/match-header.tsx` | `TeamBlock` に `flag` prop を追加 |
| `components/match-content-section.tsx` | shadcn Card 廃止、統一スタイルに |
| `app/globals.css` | `body` に `bg-slate-50` を追加 |
| `app/layout.tsx` | `<body>` に `min-h-screen` を追加 |
| `app/page.tsx` | `gap-8` → `gap-10` |

## 依存関係

- `match-header.tsx` の国旗追加は `frontend-match-visuals.md`（タスク6）の `dimmed` prop 実装後に行うこと

## 完了条件

- `pnpm tsc --noEmit` がエラーなし
- マッチカードと試合詳細ヘッダーに国旗絵文字が表示される
- プレビュー・レビューセクションのスタイルが `MatchEventsSection` と統一されている
- ページ全体の背景色がナビバー含めて `slate-50` で統一されている
