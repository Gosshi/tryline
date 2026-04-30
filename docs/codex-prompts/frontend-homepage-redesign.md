# Codex プロンプト: ホームページリデザイン

## 目的

1. ホームページのコンペティション選択をハードコードから動的取得に変更する
2. マッチカードおよびホームページ全体のビジュアルをモダン・スタイリッシュに刷新する

---

## タスク 1: 動的コンペティション取得

### 追加するクエリ関数

`lib/db/queries/matches.ts` に以下を追加してください。

**新しい型:**

```typescript
export type CompetitionSummary = {
  slug: string;
  name: string;
  season: string;
  startDate: string | null;
  endDate: string | null;
};
```

**新しい関数 `getLatestCompetitionWithMatches`:**

- `matches` テーブルで `status = 'finished'` の試合を `kickoff_at` 降順で取得し、`competitions` を join する
- 最も新しい finished 試合のコンペティションを 1 件返す
- 見つからない場合は `null` を返す

```typescript
export async function getLatestCompetitionWithMatches(): Promise<CompetitionSummary | null> {
  const client = getSupabasePublicServerClient();

  const { data, error } = await client
    .from("matches")
    .select(
      `
        kickoff_at,
        competition:competitions!matches_competition_id_fkey (
          slug,
          name,
          season,
          start_date,
          end_date
        )
      `
    )
    .eq("status", "finished")
    .order("kickoff_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data || !data.competition) return null;

  return {
    endDate: (data.competition as { end_date?: string | null }).end_date ?? null,
    name: data.competition.name,
    season: data.competition.season,
    slug: data.competition.slug,
    startDate: (data.competition as { start_date?: string | null }).start_date ?? null,
  };
}
```

> **注意**: `competitions` テーブルに `start_date` / `end_date` カラムがない場合は、それらのフィールドを select と型から外し、`startDate: null, endDate: null` で固定してください。カラムの有無は `supabase/migrations/` を確認して判断してください。

---

## タスク 2: `app/page.tsx` の更新

### 変更内容

- `COMPETITION_SLUG` 定数を削除する
- `getLatestCompetitionWithMatches()` を呼び出して competition を取得する
- competition が取得できない場合は「現在表示できる試合はありません」メッセージを表示する
- `metadata` を動的に生成する（`generateMetadata` 関数を使用）
- ヘッダーに competition の `name` と `season` を動的表示する

### 完成後の構造

```typescript
import { getLatestCompetitionWithMatches, listMatchesForCompetition } from "@/lib/db/queries/matches";

export async function generateMetadata(): Promise<Metadata> {
  const competition = await getLatestCompetitionWithMatches();
  if (!competition) return { title: "Tryline" };
  return { title: `${competition.name} ${competition.season} - Tryline` };
}

export default async function HomePage() {
  const competition = await getLatestCompetitionWithMatches();

  if (!competition) {
    return (
      <main className="min-h-screen bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:px-8">
          <p className="text-sm text-slate-500">現在表示できる試合はありません</p>
        </div>
      </main>
    );
  }

  const matches = await listMatchesForCompetition(competition.slug);
  const groupedMatches = groupMatchesByRound(matches);
  // ... 以降は既存の groupMatchesByRound ロジックを流用
}
```

---

## タスク 3: ホームページレイアウトのリデザイン

スタイル方針: **モダン・スタイリッシュ**。スコアの視認性重視、明確な情報ヒエラルキー。

### ヘッダーブロック

```tsx
<header className="space-y-3 pb-6 border-b border-slate-200">
  <span className="inline-block rounded-full bg-emerald-500 px-3 py-0.5 text-xs font-semibold uppercase tracking-widest text-white">
    Tryline
  </span>
  <h1 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
    {competition.name}
    <span className="ml-3 text-2xl font-normal text-slate-400 sm:text-3xl">{competition.season}</span>
  </h1>
</header>
```

### ラウンド見出し

`RoundHeading` コンポーネントを以下のデザインに更新してください:

```tsx
export function RoundHeading({ round }: RoundHeadingProps) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
        {round === null ? "節未定" : `Round ${round}`}
      </h2>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  );
}
```

---

## タスク 4: `MatchCard` のリデザイン

### デザイン要件

- チーム略称（shortCode）と**フルネームを両方表示**
- スコアをカード中央に大きく配置（`text-3xl font-bold`）
- finished 試合のスコアは `text-slate-950`、未試合は `—`（`text-slate-300`）
- カードはボーダーのみ（shadcn `Card` コンポーネントは使わず `<article>` に直接クラス）
- hover 時は `border-slate-400`
- 会場はカード下部に `text-xs text-slate-400`

### 実装

`components/match-card.tsx` を以下の構造で書き直してください:

```tsx
import Link from "next/link";
import { formatKickoffJst } from "@/lib/format/kickoff";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./status-badge";
import type { MatchListItem } from "@/lib/db/queries/matches";

type MatchCardProps = {
  match: MatchListItem;
};

function getScoreline(match: MatchListItem): string {
  if (match.status !== "finished") return "—";
  return `${match.homeScore ?? 0} – ${match.awayScore ?? 0}`;
}

export function MatchCard({ match }: MatchCardProps) {
  return (
    <Link className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded-xl" href={`/matches/${match.id}`}>
      <article className="h-full rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-400 hover:bg-slate-50">
        {/* 日時 + ステータス */}
        <div className="mb-4 flex items-center justify-between">
          <time className="text-xs font-medium text-slate-500" dateTime={match.kickoffAt}>
            {formatKickoffJst(match.kickoffAt)}
          </time>
          <StatusBadge status={match.status} />
        </div>

        {/* チーム vs スコア */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="text-right">
            <p className="text-xl font-bold text-slate-900">{match.homeTeam.shortCode}</p>
            <p className="text-xs text-slate-400 leading-tight">{match.homeTeam.name}</p>
          </div>

          <p
            className={cn(
              "px-3 text-3xl font-bold tabular-nums",
              match.status === "finished" ? "text-slate-950" : "text-slate-300",
            )}
          >
            {getScoreline(match)}
          </p>

          <div className="text-left">
            <p className="text-xl font-bold text-slate-900">{match.awayTeam.shortCode}</p>
            <p className="text-xs text-slate-400 leading-tight">{match.awayTeam.name}</p>
          </div>
        </div>

        {/* 会場 */}
        {match.venue && (
          <p className="mt-4 text-xs text-slate-400">{match.venue}</p>
        )}
      </article>
    </Link>
  );
}
```

---

## 変更するファイル一覧

| ファイル | 変更内容 |
|---|---|
| `lib/db/queries/matches.ts` | `CompetitionSummary` 型と `getLatestCompetitionWithMatches` を追加 |
| `app/page.tsx` | 動的 competition 取得、`generateMetadata` 化、レイアウトリデザイン |
| `components/match-card.tsx` | 3カラムグリッドレイアウト、スコア強調、フルネーム追加 |
| `components/round-heading.tsx` | uppercase tracking スタイルに更新 |

---

## 完了条件

- `pnpm tsc --noEmit` がエラーなし
- `pnpm dev` で `http://localhost:3000/` を開くと six-nations-2025 の試合一覧が表示される（`six-nations-2027` ではない）
- マッチカードにフルネームとスコアが視認性高く表示される
- `app/page.tsx` にハードコードされたスラッグ・年度が残っていない
