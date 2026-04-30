# Codex プロンプト: 試合ビジュアル改善（勝敗表現・タイムライン・empty state）

## タスク 6: 勝敗の視覚的表現

### `components/match-card.tsx`

`finished` な試合で、勝利チームと敗北チームを色で区別する。

```typescript
type MatchOutcome = "home_win" | "away_win" | "draw" | "unknown";

function getOutcome(match: MatchListItem): MatchOutcome {
  if (match.status !== "finished" || match.homeScore === null || match.awayScore === null) {
    return "unknown";
  }
  if (match.homeScore > match.awayScore) return "home_win";
  if (match.awayScore > match.homeScore) return "away_win";
  return "draw";
}
```

チーム名の表示:
- **勝利チーム** shortCode + name: `text-slate-900`
- **敗北チーム** shortCode + name: `text-slate-400`
- 引き分け・未定: 両方 `text-slate-900`

スコアの表示（3カラム中央）:

```tsx
const outcome = getOutcome(match);
const homeWon = outcome === "home_win";
const awayWon = outcome === "away_win";

<p className="px-3 text-3xl font-bold tabular-nums">
  <span className={homeWon ? "text-slate-950" : awayWon ? "text-slate-400" : "text-slate-950"}>
    {match.homeScore ?? 0}
  </span>
  <span className="mx-1 text-slate-300">–</span>
  <span className={awayWon ? "text-slate-950" : homeWon ? "text-slate-400" : "text-slate-950"}>
    {match.awayScore ?? 0}
  </span>
</p>
```

`getScoreline` 関数は不要になるので削除する。

### `components/match-header.tsx`

`TeamBlock` に `dimmed: boolean` prop を追加し、`dimmed === true` のとき shortCode・name を `text-slate-400` にする。

```typescript
function getOutcome(match: MatchDetail): MatchOutcome {
  if (match.status !== "finished" || match.homeScore === null || match.awayScore === null) {
    return "unknown";
  }
  if (match.homeScore > match.awayScore) return "home_win";
  if (match.awayScore > match.homeScore) return "away_win";
  return "draw";
}
```

```tsx
const outcome = getOutcome(match);

<TeamBlock
  align="right"
  name={match.homeTeam.name}
  shortCode={match.homeTeam.shortCode}
  dimmed={outcome === "away_win"}
/>
// スコア中央
<TeamBlock
  align="left"
  name={match.awayTeam.name}
  shortCode={match.awayTeam.shortCode}
  dimmed={outcome === "home_win"}
/>
```

`TeamBlock` の実装:
```tsx
function TeamBlock({ align, name, shortCode, dimmed }: {
  align: "left" | "right";
  name: string;
  shortCode: string;
  dimmed: boolean;
}) {
  return (
    <div className={align === "right" ? "min-w-0 text-right" : "min-w-0 text-left"}>
      <p className={cn(
        "truncate text-2xl font-black tracking-tight sm:text-3xl",
        dimmed ? "text-slate-400" : "text-slate-900"
      )}>
        {shortCode}
      </p>
      <p className={cn(
        "mt-1 truncate text-xs font-medium leading-tight sm:text-sm",
        dimmed ? "text-slate-300" : "text-slate-400"
      )}>
        {name}
      </p>
    </div>
  );
}
```

`MatchOutcome` 型は両ファイルで必要なので `lib/format/match-outcome.ts` として切り出してもよい。

---

## タスク 7: 得点経過を時系列タイムラインに変更

### `components/match-events-section.tsx` を書き直す

現在はイベントタイプ別グループ表示。**時系列順（minute 昇順）** に変更し、ホーム/アウェイを左右に配置する。

イメージ:
```
France           分    Wales
Attissogbé トライ  18'
                  23'   Biggar ペナルティゴール
Bielle-Biarrey    40'
```

```typescript
const EVENT_TYPE_LABEL: Record<string, string> = {
  conversion: "コンバージョン",
  drop_goal: "ドロップゴール",
  penalty_goal: "ペナルティゴール",
  red_card: "レッドカード",
  try: "トライ",
  yellow_card: "イエローカード",
};

function sortEvents(events: MatchEventRow[]): MatchEventRow[] {
  return [...events].sort((a, b) => {
    if (a.minute === null && b.minute === null) return 0;
    if (a.minute === null) return 1;
    if (b.minute === null) return -1;
    return a.minute - b.minute;
  });
}
```

```tsx
export function MatchEventsSection({ events, homeTeamId, homeTeamName, awayTeamName }: MatchEventsSectionProps) {
  if (events.length === 0) return null;

  const sorted = sortEvents(events);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-4 border-b border-slate-100 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          Scoring Timeline
        </p>
        <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-950">得点経過</h2>
      </div>

      {/* チーム名ヘッダー */}
      <div className="mb-2 grid grid-cols-[1fr_3rem_1fr] gap-2 text-xs font-semibold text-slate-500">
        <span>{homeTeamName}</span>
        <span />
        <span className="text-right">{awayTeamName}</span>
      </div>

      <div className="space-y-0.5">
        {sorted.map((event) => {
          const isHome = event.teamId === homeTeamId;
          const label = event.isPenaltyTry
            ? "ペナルティトライ"
            : `${event.playerName} ${EVENT_TYPE_LABEL[event.type] ?? event.type}`;

          return (
            <div
              className="grid grid-cols-[1fr_3rem_1fr] items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-50"
              key={event.id}
            >
              <span className="min-w-0 truncate text-sm text-slate-700">
                {isHome ? label : ""}
              </span>
              <span className="text-center text-xs font-semibold tabular-nums text-slate-400">
                {event.minute !== null ? `${event.minute}'` : "—"}
              </span>
              <span className="min-w-0 truncate text-right text-sm text-slate-700">
                {!isHome ? label : ""}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

---

## タスク 8: empty state のデザイン改善

### `components/content-placeholder.tsx` を書き直す

現在は `<p className="text-sm text-slate-500">` のみ。アイコン付きの背景カードに変更する。

```tsx
const ICON: Record<ContentPlaceholderProps["state"], string> = {
  pre_window: "🕐",
  preparing: "⏳",
  unavailable: "—",
};

export function ContentPlaceholder({ state, type }: ContentPlaceholderProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-slate-50 px-4 py-4">
      <span aria-hidden className="mt-0.5 shrink-0 text-lg leading-none" role="img">
        {ICON[state]}
      </span>
      <p className="text-sm text-slate-500">{COPY[type][state]}</p>
    </div>
  );
}
```

`COPY` 定数は既存の内容をそのまま流用する。

---

## 変更するファイル一覧

| ファイル | 変更内容 |
|---|---|
| `components/match-card.tsx` | `getOutcome` 追加、勝利/敗北チームの色分け |
| `components/match-header.tsx` | `TeamBlock` に `dimmed` prop 追加、`getOutcome` で制御 |
| `components/match-events-section.tsx` | タイプ別グループ → 時系列タイムラインに全面書き直し |
| `components/content-placeholder.tsx` | アイコン付きの背景カードに |

## 完了条件

- `pnpm tsc --noEmit` がエラーなし
- finished な試合カードで敗北チームの shortCode・スコアがグレーになっている
- 試合詳細の「得点経過」が時系列（分数順）で左右に並ぶ
- 「プレビューを準備中です」がアイコン付きの背景カードで表示される
