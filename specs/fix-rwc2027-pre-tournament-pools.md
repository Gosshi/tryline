# RWC2027 開幕前ページのプール表示を日程優先に変更

## 背景

2026-07-03 のデザイン・UI・集客横断レビュー（`docs/design-ui-growth-review-2026-07-03.md` B-8）で、`/c/rwc/2027` の開幕前表示に構成上の問題があることが判明した。

`specs/fix-rwc2027-hub-page-gate.md`（本番反映済み）でページ全体が「Coming Soon」に差し替わる不具合は解消され、プール順位表と日程がどちらも表示されるようになった。しかし現在の表示順は「全て 0-0-0 の順位表が6プール連続で上部を占有 → 日程（`SeasonMatchGroups`）が下部」という構成になっている。GSC 実測（2026-07-03、`tools/gsc-pull.ts`）で確認されている実需要クエリ（「ラグビーワールドカップ 日程」「2027 ワールドカップ」）は日程情報を求めるものであり、開幕前に無意味な 0-0-0 の表を6面も先に見せる現在の構成は検索意図とズレている。

## スコープ

**対象:** `app/c/rwc/2027/page.tsx` のみ

**対象外:**
- `app/c/rwc/2027/bracket/page.tsx`（ノックアウトブラケットは対象外。`fix-rwc2027-hub-page-gate.md` の対象外指定を踏襲する）
- `lib/db/queries/standings.ts` の `getPoolStandingsForCompetition`（データ取得ロジックは変更しない。既存の `PoolStanding[]` をそのまま利用する）
- `components/standings-table.tsx`（開幕後の本物の順位表表示に使う既存コンポーネントは変更しない）
- 国旗アイコンの追加（`components/flag-icon.tsx` は `slug` を要求するが `StandingRow` に slug フィールドが無いため、本 spec では文字表示のみとする。詳細は「未解決の質問」参照）

## データモデル変更

なし。

## API サーフェス

なし。

## UI サーフェス

### 表示順序の変更（`tournamentStarted` で分岐）

現状（`app/c/rwc/2027/page.tsx:86-131`）:

```
header
PreTournamentBanner（!tournamentStarted の場合）
poolStandings.map(pool => StandingsTable)  ← 常にこの位置（6面連続）
SeasonMatchGroups
```

変更後:

```
header
PreTournamentBanner（!tournamentStarted の場合）
!tournamentStarted
  ? [SeasonMatchGroups（日程を先に）, PoolTeamGrid（新規、順位表の代わりの軽量表示）]
  : [poolStandings.map(pool => StandingsTable)（開幕後は従来通り本物の順位表が先）, SeasonMatchGroups]
```

開幕前は「日程が主役、プール分けは参考情報」、開幕後は「順位表が主役（`feat-season-page-ia.md` の一般シーズンページと同じ思想）」という切り分けにする。

### `PoolTeamGrid`（新規コンポーネントまたは同一ファイル内関数）

`poolStandings: PoolStanding[]` を受け取り、各プールを「チーム名のみのコンパクトなグリッド」として表示する。既存の `StandingsTable`（試合数・勝敗・得失点等のフル統計列）は開幕前は無意味な 0 が並ぶだけなので使わない。

```tsx
function PoolTeamGrid({ poolStandings }: { poolStandings: PoolStanding[] }) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {poolStandings.map((pool) => (
        <div
          className="rounded-[var(--radius-md)] bg-white p-4 shadow-[var(--shadow-soft)]"
          key={pool.poolName}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            {pool.poolName}
          </p>
          <ul className="mt-2 space-y-1">
            {pool.standings.map((row) => (
              <li
                className="text-sm font-medium text-[var(--color-ink)]"
                key={row.position}
              >
                {row.teamName === "-" ? (
                  <span className="text-slate-400">未確定</span>
                ) : (
                  row.teamName
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
```

`row.teamName === "-"`（予選プレーオフ勝者等、未確定枠のプレースホルダ）は「未確定」という文言に置き換える。現状の生の `-` 表示（`docs/design-ui-growth-review-2026-07-03.md` B-8 で指摘）を解消する。

### 見出しの日本語化

`app/c/rwc/2027/page.tsx:93-94` の `<h1>Rugby World Cup 2027</h1>` は英語のままになっている。カタカナ表記方針（`specs/feat-japanese-team-competition-names.md`）との整合を取るため、`ラグビーワールドカップ2027` に変更する。`metadata.title`（13-14行目）は既に日本語のためこの h1 だけがずれている。

## LLM 連携

なし。

## 受け入れ条件

1. `tournamentStarted === false` の場合、`SeasonMatchGroups`（日程）が `PoolTeamGrid`（プール分け）より上に表示される
2. `tournamentStarted === false` の場合、6プール分の `StandingsTable`（0-0-0 の統計列）が表示されない
3. `PoolTeamGrid` で未確定枠が「未確定」と表示され、生の `-` が表示されない
4. `tournamentStarted === true` の場合、従来通り `StandingsTable`（実統計）が `SeasonMatchGroups` より上に表示される
5. `<h1>` が「ラグビーワールドカップ2027」になっている
6. `matches.length === 0`（データ未投入）の場合の `PendingState` 表示は変更されない
7. `pnpm tsc --noEmit` / `pnpm build` が通る

## 未解決の質問

- `PoolTeamGrid` に国旗アイコンを追加したいが、`StandingRow`（`lib/db/queries/standings.ts`）に `slug` フィールドが無く `components/flag-icon.tsx` の `slug` 要件を満たせない。国旗を追加する場合は `getPoolStandingsForCompetition` にチームスラッグを含める別 spec が必要。本 spec ではテキスト表示のみとする
- `tournamentStarted` の判定（`match.status === "finished" || "in_progress"`）は既存ロジックのまま流用する想定。変更不要という理解でよいか
