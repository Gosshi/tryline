# Codex プロンプト: 試合詳細ページ リデザイン

## 目的

1. `MatchHeader` をモダンなヒーローレイアウトに刷新する
2. 得点イベント（トライ・コンバージョン等）の一覧を新規追加する
3. 出場選手（スターター＋ベンチ）の表示セクションを新規追加する
4. 試合詳細ページ全体のレイアウトを整える

---

## データモデルの確認（変更不要）

### `match_events` テーブル

| カラム | 型 | 内容 |
|---|---|---|
| `match_id` | uuid | |
| `team_id` | uuid | ホーム/アウェイの判定に使う |
| `minute` | integer \| null | 分（null = 時刻不明） |
| `type` | text | `try` / `conversion` / `penalty_goal` / `drop_goal` / `yellow_card` / `red_card` / `substitution` |
| `metadata` | jsonb | `{ player_name: string, is_penalty_try?: boolean }` |

### `match_lineups` テーブル

| カラム | 型 | 内容 |
|---|---|---|
| `match_id` | uuid | |
| `team_id` | uuid | |
| `player_id` | uuid | `players` テーブルへの参照 |
| `jersey_number` | smallint | 1〜15 = スターター、16〜23 = ベンチ |
| `is_starter` | boolean | `jersey_number <= 15` で自動生成 |

### `players` テーブル

| カラム | 型 |
|---|---|
| `name` | text |
| `position` | text \| null |

---

## タスク 1: クエリ関数の追加

### `lib/db/queries/match-events.ts`（新規作成）

```typescript
import { getSupabasePublicServerClient } from "@/lib/db/public-server";

export type MatchEventRow = {
  id: string;
  minute: number | null;
  type: string;
  teamId: string;
  playerName: string;
  isPenaltyTry: boolean;
};

export async function getMatchEventsForMatch(matchId: string): Promise<MatchEventRow[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_events")
    .select("id, minute, type, team_id, metadata")
    .eq("match_id", matchId)
    .order("minute", { ascending: true, nullsFirst: false });

  if (error) throw error;

  return data.map((row) => {
    const metadata = row.metadata as { player_name?: string; is_penalty_try?: boolean } | null;
    return {
      id: row.id,
      isPenaltyTry: metadata?.is_penalty_try ?? false,
      minute: row.minute,
      playerName: metadata?.player_name ?? "—",
      teamId: row.team_id,
      type: row.type,
    };
  });
}
```

### `lib/db/queries/match-lineups.ts`（新規作成）

```typescript
import { getSupabasePublicServerClient } from "@/lib/db/public-server";

export type MatchLineupPlayer = {
  jerseyNumber: number;
  isStarter: boolean;
  playerName: string;
  position: string | null;
  teamId: string;
};

export async function getMatchLineupsForMatch(matchId: string): Promise<MatchLineupPlayer[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_lineups")
    .select(`
      jersey_number,
      is_starter,
      team_id,
      player:players!match_lineups_player_id_fkey (
        name,
        position
      )
    `)
    .eq("match_id", matchId)
    .order("team_id")
    .order("jersey_number");

  if (error) throw error;

  return data.map((row) => ({
    isStarter: row.is_starter,
    jerseyNumber: row.jersey_number,
    playerName: (row.player as { name: string } | null)?.name ?? "—",
    position: (row.player as { position?: string | null } | null)?.position ?? null,
    teamId: row.team_id,
  }));
}
```

---

## タスク 2: `MatchDetail` 型と `getMatchById` に `homeTeamId` / `awayTeamId` を追加

`MatchEventsSection` と `MatchLineupsSection` はホーム/アウェイの振り分けに UUID が必要。

`lib/db/queries/matches.ts` を以下のように変更してください:

- `MatchDetail` 型に `homeTeamId: string` と `awayTeamId: string` を追加
- `getMatchById` のクエリに `home_team_id, away_team_id` を追加
- `mapMatchRow` または `getMatchById` 内でこれらのフィールドを返す

---

## タスク 3: `MatchHeader` のリデザイン

`components/match-header.tsx` を書き直す。shadcn の `Card` は使わず、素の HTML に Tailwind を当てる。

```tsx
import Link from "next/link"; // 不要なら削除
import { cn } from "@/lib/utils";
import { formatKickoffJst, formatKickoffLocal } from "@/lib/format/kickoff";
import { StatusBadge } from "./status-badge";
import type { MatchDetail } from "@/lib/db/queries/matches";

// ... TEAM_TIMEZONES と getVenueTimezone は既存のまま流用

function getScoreline(match: MatchDetail): string {
  if (match.status !== "finished") return "—";
  return `${match.homeScore ?? 0} – ${match.awayScore ?? 0}`;
}

export function MatchHeader({ match }: MatchHeaderProps) {
  const localTimezone = getVenueTimezone(match.homeTeam.slug);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      {/* ステータス + コンペティション */}
      <div className="mb-5 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-widest text-slate-400">
          {match.competition.name} {match.competition.season}
          {match.round !== null ? ` · Round ${match.round}` : ""}
        </p>
        <StatusBadge status={match.status} />
      </div>

      {/* チーム vs スコア */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="text-right">
          <p className="text-2xl font-bold text-slate-900">{match.homeTeam.shortCode}</p>
          <p className="mt-0.5 text-sm text-slate-400">{match.homeTeam.name}</p>
        </div>

        <p
          className={cn(
            "px-4 text-5xl font-bold tabular-nums",
            match.status === "finished" ? "text-slate-950" : "text-slate-300",
          )}
        >
          {getScoreline(match)}
        </p>

        <div className="text-left">
          <p className="text-2xl font-bold text-slate-900">{match.awayTeam.shortCode}</p>
          <p className="mt-0.5 text-sm text-slate-400">{match.awayTeam.name}</p>
        </div>
      </div>

      {/* メタ情報 */}
      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-100 pt-4 text-xs text-slate-500">
        <span>
          <span className="font-medium text-slate-700">JST</span>{" "}
          {formatKickoffJst(match.kickoffAt)}
        </span>
        <span>
          <span className="font-medium text-slate-700">現地</span>{" "}
          {formatKickoffLocal(match.kickoffAt, localTimezone)}
        </span>
        {match.venue && <span>{match.venue}</span>}
      </div>
    </div>
  );
}
```

---

## タスク 4: `MatchEventsSection` コンポーネント（新規作成）

`components/match-events-section.tsx` を作成する。

- `events` が空の場合は `null` を返す（セクション自体を非表示）
- イベントを `EVENT_TYPE_ORDER` 順にグループ化して表示
- ホーム（左カラム）とアウェイ（右カラム）を並べる

```typescript
const EVENT_TYPE_LABEL: Record<string, string> = {
  try: "トライ",
  conversion: "コンバージョン",
  penalty_goal: "ペナルティゴール",
  drop_goal: "ドロップゴール",
  yellow_card: "イエローカード",
  red_card: "レッドカード",
};

const EVENT_TYPE_ORDER = [
  "try", "conversion", "penalty_goal", "drop_goal", "yellow_card", "red_card",
];
```

```tsx
type MatchEventsSectionProps = {
  events: MatchEventRow[];
  homeTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
};

export function MatchEventsSection({
  events,
  homeTeamId,
  homeTeamName,
  awayTeamName,
}: MatchEventsSectionProps) {
  if (events.length === 0) return null;

  const homeEvents = events.filter((e) => e.teamId === homeTeamId);
  const awayEvents = events.filter((e) => e.teamId !== homeTeamId);
  const activeTypes = EVENT_TYPE_ORDER.filter((t) => events.some((e) => e.type === t));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
        得点経過
      </h2>

      {/* チーム名ヘッダー */}
      <div className="mb-3 grid grid-cols-2 gap-4 border-b border-slate-100 pb-3">
        <p className="text-sm font-semibold text-slate-700">{homeTeamName}</p>
        <p className="text-sm font-semibold text-slate-700">{awayTeamName}</p>
      </div>

      {activeTypes.map((type) => {
        const homeOfType = homeEvents.filter((e) => e.type === type);
        const awayOfType = awayEvents.filter((e) => e.type === type);

        return (
          <div className="mb-4 grid grid-cols-2 gap-4" key={type}>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-400">
                {EVENT_TYPE_LABEL[type] ?? type}
              </p>
              {homeOfType.length === 0 ? (
                <p className="text-sm text-slate-300">—</p>
              ) : (
                homeOfType.map((e) => (
                  <p className="text-sm text-slate-700" key={e.id}>
                    {e.isPenaltyTry ? "ペナルティトライ" : e.playerName}
                    {e.minute !== null && (
                      <span className="ml-1 text-xs text-slate-400">{e.minute}'</span>
                    )}
                  </p>
                ))
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-400">
                {EVENT_TYPE_LABEL[type] ?? type}
              </p>
              {awayOfType.length === 0 ? (
                <p className="text-sm text-slate-300">—</p>
              ) : (
                awayOfType.map((e) => (
                  <p className="text-sm text-slate-700" key={e.id}>
                    {e.isPenaltyTry ? "ペナルティトライ" : e.playerName}
                    {e.minute !== null && (
                      <span className="ml-1 text-xs text-slate-400">{e.minute}'</span>
                    )}
                  </p>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

---

## タスク 5: `MatchLineupsSection` コンポーネント（新規作成）

`components/match-lineups-section.tsx` を作成する。データがなければ非表示。

```tsx
type MatchLineupsSectionProps = {
  players: MatchLineupPlayer[];
  homeTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
};

export function MatchLineupsSection({
  players,
  homeTeamId,
  homeTeamName,
  awayTeamName,
}: MatchLineupsSectionProps) {
  if (players.length === 0) return null;

  const homePlayers = players.filter((p) => p.teamId === homeTeamId);
  const awayPlayers = players.filter((p) => p.teamId !== homeTeamId);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
        出場選手
      </h2>
      <div className="grid grid-cols-2 gap-6">
        <PlayerColumn name={homeTeamName} players={homePlayers} />
        <PlayerColumn name={awayTeamName} players={awayPlayers} />
      </div>
    </div>
  );
}

function PlayerColumn({ name, players }: { name: string; players: MatchLineupPlayer[] }) {
  const starters = players.filter((p) => p.isStarter);
  const bench = players.filter((p) => !p.isStarter);

  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-slate-700">{name}</p>
      {starters.map((p) => (
        <div className="flex gap-2 py-0.5" key={p.jerseyNumber}>
          <span className="w-5 shrink-0 text-right text-xs font-medium text-slate-400">
            {p.jerseyNumber}
          </span>
          <span className="text-sm text-slate-700">{p.playerName}</span>
        </div>
      ))}
      {bench.length > 0 && (
        <>
          <div className="my-2 h-px bg-slate-100" />
          {bench.map((p) => (
            <div className="flex gap-2 py-0.5" key={p.jerseyNumber}>
              <span className="w-5 shrink-0 text-right text-xs font-medium text-slate-300">
                {p.jerseyNumber}
              </span>
              <span className="text-sm text-slate-500">{p.playerName}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
```

---

## タスク 6: `app/matches/[id]/page.tsx` の更新

```tsx
import { getMatchEventsForMatch } from "@/lib/db/queries/match-events";
import { getMatchLineupsForMatch } from "@/lib/db/queries/match-lineups";
import { MatchEventsSection } from "@/components/match-events-section";
import { MatchLineupsSection } from "@/components/match-lineups-section";

// Promise.all を更新
const [match, publishedContent, events, lineups] = await Promise.all([
  getMatchById(id),
  getPublishedContentForMatch(id),
  getMatchEventsForMatch(id),
  getMatchLineupsForMatch(id),
]);
```

ページレイアウト:

```tsx
return (
  <main className="min-h-screen bg-slate-50">
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 md:px-8">
      <Link
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        href="/"
      >
        ← 一覧に戻る
      </Link>

      <MatchHeader match={match} />

      <MatchEventsSection
        awayTeamName={match.awayTeam.name}
        events={events}
        homeTeamId={match.homeTeamId}
        homeTeamName={match.homeTeam.name}
      />

      <MatchLineupsSection
        awayTeamName={match.awayTeam.name}
        homeTeamId={match.homeTeamId}
        homeTeamName={match.homeTeam.name}
        players={lineups}
      />

      <section className="space-y-4">
        <MatchContentSection content={publishedContent.preview} contentType="preview" match={match} />
        <MatchContentSection content={publishedContent.recap} contentType="recap" match={match} />
      </section>
    </div>
  </main>
);
```

`Button` コンポーネントのインポートは削除してください（使わなくなる）。

---

## 変更するファイル一覧

| ファイル | 変更内容 |
|---|---|
| `lib/db/queries/match-events.ts` | 新規作成 |
| `lib/db/queries/match-lineups.ts` | 新規作成 |
| `lib/db/queries/matches.ts` | `getMatchById` に `homeTeamId` / `awayTeamId` を追加、`MatchDetail` 型を更新 |
| `components/match-header.tsx` | 3カラムヒーローレイアウトに刷新、`Card` 廃止 |
| `components/match-events-section.tsx` | 新規作成 |
| `components/match-lineups-section.tsx` | 新規作成 |
| `app/matches/[id]/page.tsx` | 新コンポーネントを組み込み、レイアウト整理 |

---

## 完了条件

- `pnpm tsc --noEmit` がエラーなし
- 得点イベントがある試合の詳細ページを開くと「得点経過」セクションが表示される
- 得点イベントがない試合では「得点経過」セクションが非表示になる
- 出場選手データがない試合では「出場選手」セクションが非表示になる
- 戻るリンクが `<Button>` ではなくシンプルな `<Link>` になっている
- `MatchHeader` がヒーローレイアウト（3カラム）で表示される
