# feat-live-competition-ingest: 全大会リアルタイム取込基盤

## 背景

現在すべての大会スクレイパーは `status: "finished"` の試合のみを返す設計になっており、今後の試合がサイトに表示されない。全8大会について「今シーズン」の予定試合（`status: "scheduled"`）も取り込み、週次 cron で結果が出たら自動更新できるようにする。

**このプロンプトは `docs/codex-prompts/feat-super-rugby-pacific-2026.md` を置き換える。**

**既存の `lib/scrapers/wikipedia-*.ts`・`lib/scrapers/league-one-schedule.ts` は一切変更しない。** 新しい source adapter を `lib/ingestion/sources/` に作成し、既存スクレイパーをラップして scheduled 対応を加える。

---

## 対象大会と現シーズン

| family | season | データソース | 既存スクレイパーの状態 |
|---|---|---|---|
| `super-rugby-pacific` | `2026` | Wikipedia | score null → skip |
| `pnc` | `2026` | Wikipedia | `.filter("finished")` で除外中 |
| `autumn-nations` | `2026` | Wikipedia | `.filter("finished")` で除外中 |
| `rugby-championship` | `2026` | Wikipedia | `.filter("finished")` で除外中 |
| `premiership` | `2025-26` | Wikipedia | score null → skip |
| `urc` | `2025-26` | Wikipedia | score null → skip |
| `top-14` | `2025-26` | Wikipedia | score null → skip |
| `league-one` | `2024-25` | league-one.jp | Full-Time check + score null → skip |

Six Nations 2027 は既存 `ingest-fixtures` / `ingest-results` cron で処理済み。本プロンプトの対象外。

---

## Task 1 — competition hub h1 修正

### ファイル: `app/c/[competition]/page.tsx`

**変更前（約 42 行目）:**
```tsx
<h1 ...>
  {latestSeason.name}
</h1>
```

**変更後:**
```tsx
<h1 ...>
  {formatFamilyName(competition)}
</h1>
```

`formatFamilyName` はすでにインポート済み。

---

## Task 2 — 汎用取込関数

### ファイル: `lib/ingestion/live-ingest.ts`（新規作成）

```ts
import { getSupabaseServerClient } from "@/lib/db/server";
import { saveRawData } from "@/lib/scrapers";
import { upsertMatches } from "@/lib/ingestion/upsert";
import type { ParsedWikipediaMatch } from "@/lib/ingestion/sources/wikipedia-six-nations";
import type { Json } from "@/lib/db/types";

export type LiveCompetitionSource = {
  family: string;
  season: string;
  competitionName: string;
  competitionSlug: string;
  sourceLabel: string;
  fetch: () => Promise<ParsedWikipediaMatch[]>;
};

export type LiveIngestResult = {
  competition: string;
  counts: { matches_inserted: number; matches_updated: number };
};

async function upsertCompetition(
  source: LiveCompetitionSource,
  matches: ParsedWikipediaMatch[],
): Promise<string> {
  const client = getSupabaseServerClient();
  const dates = matches
    .map((m) => m.kickoffAt.slice(0, 10))
    .sort((a, b) => a.localeCompare(b));

  const { data, error } = await client
    .from("competitions")
    .upsert(
      {
        end_date: dates.at(-1) ?? null,
        family: source.family,
        name: source.competitionName,
        season: source.season,
        slug: source.competitionSlug,
        start_date: dates[0] ?? null,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function getTeamLookup(names: string[]): Promise<Record<string, string>> {
  const client = getSupabaseServerClient();
  const unique = [...new Set(names)];
  const { data, error } = await client
    .from("teams")
    .select("id, name, slug")
    .in("name", unique);

  if (error) throw error;
  return Object.fromEntries(data.map((t) => [t.name, t.id]));
}

export async function ingestLiveCompetition(
  source: LiveCompetitionSource,
): Promise<LiveIngestResult> {
  const parsedMatches = await source.fetch();

  if (parsedMatches.length === 0) {
    console.warn(`No matches found for ${source.competitionSlug}`);
    return { competition: source.competitionSlug, counts: { matches_inserted: 0, matches_updated: 0 } };
  }

  const competitionId = await upsertCompetition(source, parsedMatches);
  const teamLookup = await getTeamLookup(
    parsedMatches.flatMap((m) => [m.homeTeamName, m.awayTeamName]),
  );

  const resolvedMatches = parsedMatches.flatMap((m) => {
    const homeTeamId = teamLookup[m.homeTeamName];
    const awayTeamId = teamLookup[m.awayTeamName];
    if (!homeTeamId || !awayTeamId) {
      console.warn(`Skipping unknown team: ${m.homeTeamName} vs ${m.awayTeamName}`);
      return [];
    }
    const externalIds: Record<string, Json> = { source: source.sourceLabel };
    if (m.eventId) externalIds.wikipedia_event_id = m.eventId;
    if (m.round !== null && m.round !== undefined) externalIds.wikipedia_round = m.round;

    return [{
      awayScore: m.awayScore,
      awayTeamId,
      competitionId,
      externalIds,
      homeScore: m.homeScore,
      homeTeamId,
      kickoffAt: m.kickoffAt,
      rawHtml: m.rawHtml,
      status: m.status,
      venue: m.venue,
    }];
  });

  const result = await upsertMatches(resolvedMatches);

  await Promise.all(
    result.records.map((record, i) =>
      saveRawData({
        matchId: record.id,
        payload: { html: resolvedMatches[i]?.rawHtml ?? "" },
        source: source.sourceLabel,
        sourceUrl: source.competitionSlug,
      }),
    ),
  );

  console.info(`[${source.competitionSlug}] inserted=${result.matchesInserted} updated=${result.matchesUpdated}`);
  return {
    competition: source.competitionSlug,
    counts: { matches_inserted: result.matchesInserted, matches_updated: result.matchesUpdated },
  };
}
```

---

## Task 3 — Source Adapters

各ファイルを `lib/ingestion/sources/` に新規作成する。既存の `lib/scrapers/` ファイルは変更しない。

### 実装方針

各 adapter は既存スクレイパーの HTML フェッチ・パースロジックを**参考にしながら再実装**する。`ParsedWikipediaMatch` 型で返す。

**score null の扱い（Wikipedia 系 B パターン: Super Rugby Pacific, Premiership, URC, Top 14）:**
```ts
// 既存スクレイパーのパターン（変更前）
if (!score || !homeTeamName || !awayTeamName) {
  return; // scheduled もスキップ
}

// adapter での変更
if (!homeTeamName || !awayTeamName) {
  return; // チーム名不明のみスキップ
}
// score === null → scheduled として返す
const status = score ? ("finished" as const) : ("scheduled" as const);
```

**`.filter("finished")` 除去（Wikipedia 系 A パターン: Autumn Nations, PNC, Rugby Championship）:**
既存スクレイパー内の `results.filter(m => m.status === "finished")` を除いた全件を返す。内部で `ParsedWikipediaMatch` 型を既に持っているため変換は容易。

### ファイル一覧と参照元

| 新規ファイル | 参照する既存スクレイパー | season | fetch 関数名 |
|---|---|---|---|
| `wikipedia-super-rugby-pacific.ts` | `lib/scrapers/wikipedia-super-rugby-pacific-results.ts` | `2026` | `fetchSuperRugbyPacific2026` |
| `wikipedia-autumn-nations.ts` | `lib/scrapers/wikipedia-autumn-nations-results.ts` | `2026` | `fetchAutumnNations2026` |
| `wikipedia-pnc.ts` | `lib/scrapers/wikipedia-pacific-nations-cup-results.ts` | `2026` | `fetchPnc2026` |
| `wikipedia-rugby-championship.ts` | `lib/scrapers/wikipedia-rugby-championship-results.ts` | `2026` | `fetchRugbyChampionship2026` |
| `wikipedia-premiership.ts` | `lib/scrapers/wikipedia-premiership-results.ts` | `2025-26` | `fetchPremiership202526` |
| `wikipedia-urc.ts` | `lib/scrapers/wikipedia-urc-results.ts` | `2025-26` | `fetchUrc202526` |
| `wikipedia-top-14.ts` | `lib/scrapers/wikipedia-top-14-results.ts` | `2025-26` | `fetchTop14202526` |
| `league-one-live.ts` | `lib/scrapers/league-one-schedule.ts` | `2024-25` | `fetchLeagueOne202425` |

### League One の特別対応

`league-one-schedule.ts` の `parseLeagueOneScheduleHtml` では `Full-Time` チェックと score null skip がある。adapter では両方を除去し、scheduled 試合も返す:

```ts
// Full-Time チェックを除去（scheduled 試合はリンクなし or 別テキスト）
// score null → status: "scheduled", awayScore: null, homeScore: null

// scheduled 試合の eventId は idMatch がない場合も想定
const eventId = idMatch
  ? `match_${idMatch[1]}`
  : `${round}_${homeSlug}_v_${awaySlug}`;
```

League One scheduled 試合は `rawHtml` が空文字で構わない。

---

## Task 4 — 全大会レジストリ

### ファイル: `lib/ingestion/live-competitions.ts`（新規作成）

```ts
import { ingestLiveCompetition, type LiveCompetitionSource } from "./live-ingest";
import { fetchSuperRugbyPacific2026 } from "./sources/wikipedia-super-rugby-pacific";
import { fetchAutumnNations2026 } from "./sources/wikipedia-autumn-nations";
import { fetchPnc2026 } from "./sources/wikipedia-pnc";
import { fetchRugbyChampionship2026 } from "./sources/wikipedia-rugby-championship";
import { fetchPremiership202526 } from "./sources/wikipedia-premiership";
import { fetchUrc202526 } from "./sources/wikipedia-urc";
import { fetchTop14202526 } from "./sources/wikipedia-top-14";
import { fetchLeagueOne202425 } from "./sources/league-one-live";

export const LIVE_COMPETITION_SOURCES: LiveCompetitionSource[] = [
  { family: "super-rugby-pacific", season: "2026", competitionName: "Super Rugby Pacific 2026", competitionSlug: "super-rugby-pacific-2026", sourceLabel: "wikipedia", fetch: fetchSuperRugbyPacific2026 },
  { family: "pnc", season: "2026", competitionName: "Nations Cup 2026", competitionSlug: "pnc-2026", sourceLabel: "wikipedia", fetch: fetchPnc2026 },
  { family: "rugby-championship", season: "2026", competitionName: "Rugby Championship 2026", competitionSlug: "rugby-championship-2026", sourceLabel: "wikipedia", fetch: fetchRugbyChampionship2026 },
  { family: "autumn-nations", season: "2026", competitionName: "Autumn Nations 2026", competitionSlug: "autumn-nations-2026", sourceLabel: "wikipedia", fetch: fetchAutumnNations2026 },
  { family: "premiership", season: "2025-26", competitionName: "Premiership 2025-26", competitionSlug: "premiership-2025-26", sourceLabel: "wikipedia", fetch: fetchPremiership202526 },
  { family: "urc", season: "2025-26", competitionName: "URC 2025-26", competitionSlug: "urc-2025-26", sourceLabel: "wikipedia", fetch: fetchUrc202526 },
  { family: "top-14", season: "2025-26", competitionName: "Top 14 2025-26", competitionSlug: "top-14-2025-26", sourceLabel: "wikipedia", fetch: fetchTop14202526 },
  { family: "league-one", season: "2024-25", competitionName: "League One 2024-25", competitionSlug: "league-one-2024-25", sourceLabel: "league-one.jp", fetch: fetchLeagueOne202425 },
];

export async function ingestAllLiveCompetitions() {
  const results = await Promise.allSettled(
    LIVE_COMPETITION_SOURCES.map((source) => ingestLiveCompetition(source)),
  );

  for (const [i, result] of results.entries()) {
    if (result.status === "rejected") {
      console.error(`Failed to ingest ${LIVE_COMPETITION_SOURCES[i]?.competitionSlug}:`, result.reason);
    }
  }

  return results
    .filter((r): r is PromiseFulfilledResult<LiveIngestResult> => r.status === "fulfilled")
    .map((r) => r.value);
}
```

---

## Task 5 — Cron エンドポイント

### ファイル: `app/api/cron/ingest-live-competitions/route.ts`（新規作成）

```ts
import { NextResponse } from "next/server";
import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { ingestAllLiveCompetitions } from "@/lib/ingestion/live-competitions";

export const maxDuration = 300;

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    assertCronAuthorized(request);
    const results = await ingestAllLiveCompetitions();
    return NextResponse.json({ status: "ok", results, duration_ms: Date.now() - startedAt });
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to ingest live competitions.", error);
    return NextResponse.json({ error: "Failed to ingest" }, { status: 500 });
  }
}
```

---

## Task 6 — GitHub Actions ワークフロー

### ファイル: `.github/workflows/cron-ingest-live-competitions.yml`（新規作成）

```yaml
name: Cron — Ingest Live Competitions

on:
  schedule:
    - cron: '0 2 * * 1'   # 毎週月曜 JST 11:00
  workflow_dispatch:

jobs:
  ingest:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Trigger ingest-live-competitions
        run: |
          curl -f -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://tryline-six.vercel.app/api/cron/ingest-live-competitions
```

---

## 完了条件

- [ ] `POST /api/cron/ingest-live-competitions` を手動実行すると 200 が返る
- [ ] 全8大会の competition レコードが DB に存在する
- [ ] 各大会で終了済み試合は `status: "finished"`、未開催試合は `status: "scheduled"` で登録される
- [ ] 再実行（冪等）でエラーなく完了する
- [ ] `/c/super-rugby-pacific` 等の h1 が年号なしの大会名で表示される
- [ ] `pnpm tsc --noEmit` パス
- [ ] `pnpm build` パス

## 変更しないこと

- `lib/scrapers/` 以下の既存スクレイパー（すべて）
- `scripts/` 以下の既存スクリプト（すべて）
- 既存の `ingest-fixtures`・`ingest-results` cron ルートと GitHub Actions ワークフロー

## 注意事項

- `Promise.allSettled` で1大会の失敗が他大会に影響しないようにすること
- Wikipedia にまだ該当ページが存在しない大会（例: Autumn Nations 2026）はスクレイパーが空配列を返す可能性がある。エラーではなく `matches_inserted: 0` で正常終了させること
- `maxDuration = 300`（5分）を設定して Vercel の timeout に対応すること
