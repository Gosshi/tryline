# fix: Rugby Championship 得点グラフ バグ修正

## 背景

`/matches/5371f3e5-57c0-495c-a71a-be4f39fc4418`（RSA 30–22 AUS, Rugby Championship 2025）で
得点推移グラフが RSA=9pts・AUS=28pts と表示され、実スコアと完全に乖離している。

調査の結果、`lib/scrapers/wikipedia-rc-match-details.ts` に固有のバグが 2 つあることが判明した。
他の大会（Six Nations / Premiership / URC / Top 14 / Super Rugby Pacific）は別方式を使用しており
影響なし（詳細は「影響範囲」参照）。

**必ず `design.md` を最初に読んでから実装すること。**

---

## 影響範囲

| 大会 | スクレイパー | バグの有無 |
|------|------|------|
| Rugby Championship | `wikipedia-rc-match-details.ts` | **あり（本 PR で修正）** |
| Six Nations | `wikipedia-match-events.ts` の vevent パーサー | なし（列インデックス固定） |
| Premiership / Top 14 / Super Rugby | 同上 | なし |
| URC | `parseMatchEventsFromUrcDetailRowHtml` | なし（列インデックス固定） |

---

## バグ 1（重大）: ホーム・アウェイの誤割り当て

### 現状

```ts
// lib/scrapers/wikipedia-rc-match-details.ts
function parseRcMatchEvents(fragmentHtml: string): ParsedMatchEvent[] {
  const scoringCells = $("td, th, p, li, div")
    .toArray()
    .map(...)
    .filter(...)
  const uniqueScoringCells = [...new Set(scoringCells)];

  if (uniqueScoringCells.length >= 2) {
    return [
      ...parseScoringText(uniqueScoringCells[0]!, "home"),    // DOM 上の最初 → ホーム扱い
      ...parseScoringText(uniqueScoringCells[uniqueScoringCells.length - 1]!, "away"),  // 最後 → アウェイ扱い
    ];
  }
  ...
}
```

### 問題

Wikipedia の 2025 RC ページでは **アウェイ得点列が DOM 上でホーム得点列より先に現れる試合がある**。
このケースでは:
- AUS の得点セル → "home"（RSA）として処理 → RSA グラフに AUS の得点が表示
- RSA の得点セル → "away"（AUS）として処理 → AUS グラフに RSA の得点が表示

RSA グラフ 9pts の内訳は AUS の 3 ペナルティ（3×3=9）、
AUS グラフ 28pts の内訳は RSA のトライ+ペナルティ（分数記法のコンバージョンを除く）。

### 修正方針

スコア行（`X–Y` パターンを含む `<td>/<th>`）を基準に列位置を確定し、
「スコアの左列 = ホーム」「スコアの右列 = アウェイ」のルールで得点セルを取得する。

### 修正後のロジック（実装ガイドライン）

```ts
const SCORE_PATTERN = /\b\d+\s*[–-]\s*\d+\b/;

function parseRcMatchEvents(fragmentHtml: string): ParsedMatchEvent[] {
  const $ = load(fragmentHtml);

  // 1. スコア行からホーム・アウェイの列インデックスを決定
  let homeColIndex = -1;
  let awayColIndex = -1;

  for (const row of $("tr").toArray()) {
    const cells = $(row).children("td, th");
    const scoreIndex = cells
      .toArray()
      .findIndex((cell) => SCORE_PATTERN.test(cleanText($(cell).text())));

    if (scoreIndex > 0 && scoreIndex < cells.length - 1) {
      homeColIndex = scoreIndex - 1;
      awayColIndex = scoreIndex + 1;
      break;
    }
  }

  if (homeColIndex < 0) {
    // スコア行が見つからない場合は全体テキストをホームとして処理（フォールバック）
    return parseScoringText(cleanText($.text()), "home");
  }

  // 2. 各行で列インデックスを使って得点テキストを収集
  let homeText = "";
  let awayText = "";

  for (const row of $("tr").toArray()) {
    const cells = $(row).children("td, th").toArray();
    const homeCellText = cleanText($(cells[homeColIndex] ?? "").text());
    const awayCellText = cleanText($(cells[awayColIndex] ?? "").text());

    if (/\b(?:Try|Tries|Con|Cons|Pen|Pens|DG|Drop):/i.test(homeCellText)) {
      homeText = homeCellText;
    }
    if (/\b(?:Try|Tries|Con|Cons|Pen|Pens|DG|Drop):/i.test(awayCellText)) {
      awayText = awayCellText;
    }
  }

  return [
    ...parseScoringText(homeText, "home"),
    ...parseScoringText(awayText, "away"),
  ];
}
```

`SCORE_PATTERN` は `wikipedia-rc-season-parser.ts` に既に定義済みだが、
`wikipedia-rc-match-details.ts` にも同値のローカル定数として定義すること
（既存の `wikipedia-rc-season-parser.ts` の `SCORE_PATTERN` をエクスポートして import してもよい）。

---

## バグ 2（中）: コンバージョン比率記法のスキップ

### 現状

```ts
// parseScoringText 内
const minutes = [...(matched[2] ?? "").matchAll(/(\d{1,3})(?:\+\d{1,2})?\s*'/g)].map(...)

if (!playerName || minutes.length === 0) {
  continue;  // "(2/3)" はアポストロフィなし → 全スキップ
}
```

Wikipedia が `Con: Libbok (2/3)` のように個別分数なし比率記法を使うと
コンバージョンイベントが完全にスキップされ、試合イベント一覧にも表示されない。

### 修正方針

`vevent` パーサーの `parseMinutes` 関数と同様に、分数が取れない場合は `null` を返して
イベントは保持する。`minute: null` のイベントは `buildScoreTimeline` の
`minute !== null` フィルタで自動的にグラフから除外される（グラフへの影響なし）。

### 修正後のロジック

```ts
// parseScoringText 内の変更箇所のみ
const parsedMinutes = [...(matched[2] ?? "").matchAll(/(\d{1,3})(?:\+\d{1,2})?\s*'/g)].map(
  (minuteMatch) => Number(minuteMatch[1]),
);
const resolvedMinutes: Array<number | null> = parsedMinutes.length > 0 ? parsedMinutes : [null];

if (!playerName) {
  continue;
}

for (const minute of resolvedMinutes) {
  events.push({ isPenaltyTry: false, minute, playerName, teamSide, type });
}
```

---

## バグ 3（小）: ペナルティトライのポイント

### 現状

```ts
// lib/format/match-timeline.ts
function pointsFromType(type: string): number {
  if (type === "try") return 5;
  ...
}
```

ペナルティトライ（ラグビーユニオンでは 7pts）が `type="try"` で DB に保存されており、
`pointsFromType` では 5pts として計算される。

`getMatchEventsForMatch`（`lib/db/queries/match-events.ts`）は
`isPenaltyTry` を返しているが、`buildScoreTimeline` がこのフィールドを受け取っていない。

### 修正対象

**`lib/format/match-timeline.ts`**:
```ts
export function buildScoreTimeline(
  events: Array<{
    isPenaltyTry?: boolean;   // 追加
    minute: number | null;
    playerName: string | null;
    points?: number | null;
    teamId: string;
    type: string;
  }>,
  homeTeamId: string,
): ScorePoint[] {
  ...
  const points = event.points ?? pointsFromType(event.type, event.isPenaltyTry);
  ...
}

function pointsFromType(type: string, isPenaltyTry?: boolean): number {
  if (type === "try") return isPenaltyTry ? 7 : 5;
  if (type === "conversion") return 2;
  if (type === "penalty" || type === "penalty_goal" || type === "drop_goal") return 3;
  return 0;
}
```

---

## バグ 4（小）: バックフィルスクリプトの強制再実行フラグ不足

### 現状

```ts
// backfill-club-match-details.ts
if (match.competition.family === "rugby-championship") {
  return match.match_events.length === 0 || match.match_lineups.length === 0;
}
```

一度でもイベントが入っている試合はスキップされるため、
パーサー修正後に既存の誤データを上書きできない。

（`upsertMatchEvents` は実行されれば既存イベントを DELETE してから INSERT するので
上書き自体は安全）

### 修正方針

`--force` フラグを追加し、イベント有無にかかわらず RC 試合を再処理できるようにする。

```ts
// CliOptions に force: boolean を追加
// parseOptions で "--force" → force = true
// loadTargetMatches のフィルタを変更:
if (match.competition.family === "rugby-championship") {
  if (options.force) return true;
  return match.match_events.length === 0 || match.match_lineups.length === 0;
}
```

---

## 変更・作成するファイル

| ファイル | 操作 |
|---------|------|
| `lib/scrapers/wikipedia-rc-match-details.ts` | バグ 1・2 修正 |
| `lib/format/match-timeline.ts` | バグ 3 修正 |
| `scripts/backfill-club-match-details.ts` | バグ 4 修正（`--force` フラグ） |
| `tests/scrapers/wikipedia-rc-match-details.test.ts` | テスト追加（下記参照） |

---

## 変更しないこと

- `lib/scrapers/wikipedia-match-events.ts`（Six Nations / Premiership / URC 共通、バグなし）
- `lib/scrapers/wikipedia-urc-match-details.ts`（バグなし）
- `lib/scrapers/wikipedia-club-match-details.ts`（バグなし）
- `lib/db/queries/match-events.ts`（`points: null` のままでよい）
- `ParsedMatchEvent` 型の定義

---

## テスト追加

`tests/scrapers/wikipedia-rc-match-details.test.ts` に以下を追加:

### テスト 1: アウェイ列が左に来るレイアウト（バグ 1 の回帰防止）

HTML:
```html
<table>
  <tr>
    <td><a>Australia</a></td>
    <td>22–30</td>
    <td><a>South Africa</a></td>
  </tr>
  <tr>
    <td>Pen: Lolesio (5', 30', 45')</td>
    <td></td>
    <td>Try: de Allende (10', 25') Pen: Libbok (60', 75')</td>
  </tr>
</table>
```

`eventId: "Round_2_0"` を渡した場合の期待値:
- home (RSA) events: `teamSide: "home"` のトライ 2 件 + ペナルティ 2 件
- away (AUS) events: `teamSide: "away"` のペナルティ 3 件
- RSA のトライイベントが AUS に誤帰属しないこと

### テスト 2: 比率記法コンバージョンが minute=null で保持される（バグ 2 の回帰防止）

HTML（ホーム側のみ）:
```html
<td>Try: de Allende (10') Con: Libbok (1/1)</td>
<td>7–0</td>
<td></td>
```

期待値:
- `{ type: "try", minute: 10, playerName: "de Allende", teamSide: "home" }`
- `{ type: "conversion", minute: null, playerName: "Libbok", teamSide: "home" }`（スキップされないこと）

### テスト 3: ペナルティトライが 7pts（バグ 3 の回帰防止）

```ts
import { buildScoreTimeline } from "@/lib/format/match-timeline";

it("counts penalty try as 7 pts", () => {
  const events = [
    { isPenaltyTry: true, minute: 20, playerName: "Penalty try",
      teamId: "home-id", type: "try", points: null },
  ];
  const timeline = buildScoreTimeline(events, "home-id");
  expect(timeline[1]!.homeScore).toBe(7);
});
```

### テスト 4: minute=null イベントはグラフから除外される

```ts
it("excludes null-minute events from the score timeline", () => {
  const events = [
    { minute: null, playerName: "Libbok", teamId: "home-id",
      type: "conversion", points: null },
    { minute: 10, playerName: "de Allende", teamId: "home-id",
      type: "try", points: null },
  ];
  const timeline = buildScoreTimeline(events, "home-id");
  expect(timeline).toHaveLength(2);  // kickoff + 1 try
  expect(timeline[1]!.homeScore).toBe(5);
});
```

---

## 完了条件

- `pnpm tsc --noEmit` パス
- `pnpm test` パス（新規テスト 4 件含む）
- `parseRcMatchEvents` が「アウェイ列が左に来る HTML」でホーム・アウェイを正しく割り当てる
- `parseScoringText` が `(2/3)` 記法のイベントを `minute: null` で保持する（スキップしない）
- `buildScoreTimeline` でペナルティトライが 7pts として計算される
- `pnpm tsx scripts/backfill-club-match-details.ts --family=rugby-championship --force` が正常終了

## ブランチ・PR

- ブランチ: `fix/rc-score-graph`
- PR タイトル: `Fix: Rugby Championship score graph home/away inversion and null-minute events`
