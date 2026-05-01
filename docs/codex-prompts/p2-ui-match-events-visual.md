# Codex Prompt: 得点タイムラインのビジュアル強化

## 前提

`p2-design-tokens.md` が完了していること。`lib/format/team-identity.ts` に `getTeamColor(slug: string): string` が実装済みであること。

---

## 背景

現在の `components/match-events-section.tsx` は得点イベントをテキスト行（3カラムグリッド）として並べているだけで、試合の流れが読み取れない。Ireland 50 - 17 Italy のような大差試合でも、どちらのチームがいつ得点したかが視覚的に把握できない。

各イベント行の左端（ホーム）または右端（アウェイ）に**チームカラーの 3px 縦バー**を追加し、得点チームを色で即座に識別できるようにする。

---

## 変更対象ファイル

`components/match-events-section.tsx` のみ

---

## Task 1 — props に homeTeamSlug / awayTeamSlug を追加

### 変更前

```tsx
type MatchEventsSectionProps = {
  events: MatchEventRow[];
  homeTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
};
```

### 変更後

```tsx
type MatchEventsSectionProps = {
  events: MatchEventRow[];
  homeTeamId: string;
  homeTeamName: string;
  homeTeamSlug: string;
  awayTeamName: string;
  awayTeamSlug: string;
};
```

---

## Task 2 — `getTeamColor` をインポート

ファイル冒頭に追加する：

```tsx
import { getTeamColor } from "@/lib/format/team-identity";
```

---

## Task 3 — イベント行に左右チームカラーバーを追加

関数シグネチャに `homeTeamSlug`・`awayTeamSlug` を追加し、イベント行の border に適用する。

### 変更前（`return` 内・イベント行の map 部分）

```tsx
export function MatchEventsSection({
  events,
  homeTeamId,
  homeTeamName,
  awayTeamName,
}: MatchEventsSectionProps) {
  // ...
  return (
    // ...
    <div className="space-y-0.5">
      {sorted.map((event) => {
        const isHome = event.teamId === homeTeamId;
        const label = /* ... */;

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
```

### 変更後

```tsx
export function MatchEventsSection({
  events,
  homeTeamId,
  homeTeamName,
  homeTeamSlug,
  awayTeamName,
  awayTeamSlug,
}: MatchEventsSectionProps) {
  const homeColor = getTeamColor(homeTeamSlug);
  const awayColor = getTeamColor(awayTeamSlug);
  // ...
  return (
    // ...
    <div className="space-y-0.5">
      {sorted.map((event) => {
        const isHome = event.teamId === homeTeamId;
        const label = /* ... (変更なし) */;
        const teamColor = isHome ? homeColor : awayColor;

        return (
          <div
            className="grid grid-cols-[1fr_3rem_1fr] items-center gap-2 rounded py-1.5 hover:bg-slate-50/80"
            key={event.id}
            style={
              isHome
                ? { borderLeft: `3px solid ${teamColor}`, paddingLeft: "8px" }
                : { borderRight: `3px solid ${teamColor}`, paddingRight: "8px" }
            }
          >
            <span className="min-w-0 truncate text-sm text-[var(--color-ink)]">
              {isHome ? label : ""}
            </span>
            <span className="text-center text-xs font-semibold tabular-nums text-[var(--color-ink-muted)]">
              {event.minute !== null ? `${event.minute}'` : "—"}
            </span>
            <span className="min-w-0 truncate text-right text-sm text-[var(--color-ink)]">
              {!isHome ? label : ""}
            </span>
          </div>
        );
      })}
    </div>
```

**変更のポイント:**
- ホームチームの行: 左に `3px solid {homeColor}` + `paddingLeft: 8px`
- アウェイチームの行: 右に `3px solid {awayColor}` + `paddingRight: 8px`
- テキストカラーを `text-slate-700` / `text-slate-400` → `text-[var(--color-ink)]` / `text-[var(--color-ink-muted)]` に統一
- `px-2` を削除し、inline style で左右 padding を個別制御

---

## Task 4 — 呼び出し元に props を追加

`MatchEventsSection` を呼び出しているファイル（通常 `app/matches/[id]/page.tsx`）で、新しい props を渡す：

```tsx
<MatchEventsSection
  events={events}
  homeTeamId={match.homeTeam.id}
  homeTeamName={match.homeTeam.name}
  homeTeamSlug={match.homeTeam.slug}
  awayTeamName={match.awayTeam.name}
  awayTeamSlug={match.awayTeam.slug}
/>
```

`match.homeTeam.slug` / `match.awayTeam.slug` が `MatchDetail` 型に含まれているか確認すること。含まれていない場合は `lib/db/queries/matches.ts` のクエリに `slug` カラムを追加してから実装する。

---

## 完了条件

- [ ] ホームチームのイベント行左端にチームカラーの 3px バーが表示される
- [ ] アウェイチームのイベント行右端にチームカラーの 3px バーが表示される
- [ ] 両チームの得点が色で即座に識別できる
- [ ] `pnpm tsc --noEmit` がパスする
- [ ] `pnpm build` が成功する

## 変更しないこと

- イベント行の 3 カラムグリッド構造（`grid-cols-[1fr_3rem_1fr]`）
- ソートロジック（`sortEvents`）
- セクションヘッダー（"Scoring Timeline" / "得点経過"）のスタイル
- `app/matches/[id]/page.tsx` のデータ取得ロジック
