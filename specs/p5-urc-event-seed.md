# URC 2025-26 Wikipedia イベントシード

## 背景

URC 2025-26 の Wikipedia ページ（`https://en.wikipedia.org/wiki/2025%E2%80%9326_United_Rugby_Championship`）は
Premiership / Six Nations とは異なる HTML 構造を持ち、`div.vevent` が存在しない。
そのため `parseWikipediaSeasonMatches`（`div.vevent` を探す）は `source=0` を返す。

### 確認済み HTML 構造

```
<div class="mw-heading mw-heading3">
  <h3 id="Round_1">Round 1</h3>
</div>
<table class="mw-collapsible mw-collapsed" ...>
  <tbody>
    <!-- 各試合が 2 行ペアで構成される -->
    <!-- ペア × N（1ラウンドにつき最大 8 試合） -->

    <!-- 行 1 (match info row) -->
    <tr>
      <td width="15%">26 September 2025</td>       <!-- 日付 -->
      <td width="24%" style="text-align:right">
        <b>(1 BP) <a>Stormers</a></b>               <!-- ホームチーム -->
      </td>
      <td width="13%" style="text-align:center">
        <b>35 – 0</b>                               <!-- スコア -->
      </td>
      <td width="24%" style="text-align:left">
        <b><a>Leinster</a></b>                       <!-- アウェイチーム -->
      </td>
      <td>Cape Town Stadium</td>                    <!-- 会場 -->
      <th rowspan="2">&#160;</th>                   <!-- スペーサー -->
    </tr>

    <!-- 行 2 (detail row, style="font-size:85%") -->
    <tr style="font-size:85%">
      <td width="15%">18:00</td>                    <!-- キックオフ時刻 -->
      <td width="24%" style="text-align:right">     <!-- ホーム得点詳細 -->
        <b>Try:</b> <a>Ungerer</a> 45' c<br/>
        <a>Roos</a> (2) 63' c 68' c<br/>
        <b>Con:</b> <a>Matthee</a> (3/4) 45' 64' 69'<br/>
        <b>Pen:</b> <a>Matthee</a> (3/5) 7' 33' 42'<br/>
      </td>
      <td width="13%">Report / Highlights</td>      <!-- (スコアリング用途なし) -->
      <td width="24%" style="text-align:left">      <!-- アウェイ得点詳細 -->
        <b>Try:</b> ...<br/>
        <b>Cards:</b> <a>Deegan</a> 63'<br/>
      </td>
      <td>Attendance: 13,529 Referee: ...</td>      <!-- 入場者数・審判 -->
    </tr>

    <!-- 次の試合の 2 行ペア -->
    <tr>...</tr>
    <tr style="font-size:85%">...</tr>
  </tbody>
</table>
```

行 2 のセル位置（`font-size:85%` 行）:
- `cells.eq(0)` = キックオフ時刻（スコアリング用途なし）
- **`cells.eq(1)` = ホームチーム得点詳細**
- `cells.eq(2)` = Report / Highlights（スコアリング用途なし）
- **`cells.eq(3)` = アウェイチーム得点詳細**

既存の `parseScoringCell`（`wikipedia-match-events.ts` 内）はこのフォーマットに完全対応している。
`parseMatchEventsFromVeventHtml` は `cells.eq(0)` / `cells.eq(2)` を使うため、
URC 用に `cells.eq(1)` / `cells.eq(3)` を使う新関数が必要。

## スコープ

対象:
- `lib/scrapers/wikipedia-match-events.ts` — URC 用イベントパース関数を追加
- `lib/scrapers/wikipedia-urc-season-parser.ts` — 新規作成（シーズンページ → 試合リスト）
- `lib/scrapers/wikipedia-urc-match-details.ts` — 新規作成（シーズンページ → 試合イベント）
- `lib/scrapers/wikipedia-team-name-map.ts` — URC チーム名マップ追記
- `scripts/seed-wikipedia-external-ids.ts` — URC に新パーサーを使用
- `scripts/backfill-club-match-details.ts` — URC に新スクレイパーを使用

対象外:
- `div.vevent` を使う既存パーサー・スクレイパー（変更なし）
- `lib/scrapers/wikipedia-rc-match-details.ts`（変更なし）

## 1. `lib/scrapers/wikipedia-match-events.ts` の修正

`parseScoringCell` はファイル内の private 関数なので、URC 用の新しいエクスポート関数を追加する。
`parseScoringCell` 自体はエクスポートしない（呼び出し元を増やさない）。

```ts
// URC 行 2 (detail row, style="font-size:85%") の outerHTML を受け取る。
// cells.eq(1) = ホーム得点, cells.eq(3) = アウェイ得点
export function parseMatchEventsFromUrcDetailRowHtml(rowHtml: string): ParsedMatchEvent[] {
  const $ = load(rowHtml);
  const cells = $("tr").first().children("td");

  if (cells.length < 4) {
    return [];
  }

  const homeHtml = $.html(cells.eq(1)) ?? "";
  const awayHtml = $.html(cells.eq(3)) ?? "";

  return [
    ...parseScoringCell(homeHtml, "home"),
    ...parseScoringCell(awayHtml, "away"),
  ];
}
```

## 2. `lib/scrapers/wikipedia-urc-season-parser.ts`（新規）

### sectionId フォーマット

`Round_N_matchIndex` — RC パーサーと同じ形式。
- N = ラウンド番号（1〜26）
- matchIndex = そのラウンド内での試合の 0-based インデックス（行ペアの順番）

### 実装

```ts
import { load } from "cheerio";
import { parse, format } from "date-fns";
import { normalizeWikipediaTeamName } from "@/lib/scrapers/wikipedia-team-name-map";
import type { WikipediaSeasonMatch } from "@/lib/scrapers/wikipedia-season-parser";

const SCORE_PATTERN = /\b\d+\s*[–-]\s*\d+\b/;
const DATE_FORMATS = ["d MMMM yyyy", "dd MMMM yyyy"];

function dateKeyFromText(text: string): string | null {
  // "26 September 2025" → "2025-09-26"
  for (const fmt of DATE_FORMATS) {
    const parsed = parse(text.trim(), fmt, new Date(Date.UTC(2000, 0, 1)));
    if (!Number.isNaN(parsed.getTime())) {
      return format(parsed, "yyyy-MM-dd");
    }
  }
  return null;
}

function roundNumberFromId(roundId: string): number | null {
  const match = roundId.match(/^Round_(\d+)$/);
  return match ? Number(match[1]) : null;
}

export function parseWikipediaUrcSeasonMatches(html: string): WikipediaSeasonMatch[] {
  const $ = load(html);
  const matches: WikipediaSeasonMatch[] = [];

  // h3[id^='Round_'] を順番に処理
  const roundHeadings = $("h3[id^='Round_']")
    .toArray()
    .sort((a, b) => {
      const aNum = roundNumberFromId($(a).attr("id") ?? "") ?? 0;
      const bNum = roundNumberFromId($(b).attr("id") ?? "") ?? 0;
      return aNum - bNum;
    });

  for (const heading of roundHeadings) {
    const roundId = $(heading).attr("id")!;
    // heading の親 .mw-heading の次要素以降から mw-collapsible テーブルを探す
    const headingWrapper = $(heading).closest(".mw-heading");
    const start = headingWrapper.length ? headingWrapper : $(heading);
    let cursor = start.next();
    let table: ReturnType<typeof $> | null = null;

    while (cursor.length) {
      if (cursor.is("div.mw-heading")) break;
      if (cursor.is("table.mw-collapsible") || cursor.find("table.mw-collapsible").length) {
        table = cursor.is("table.mw-collapsible") ? cursor : cursor.find("table.mw-collapsible").first();
        break;
      }
      cursor = cursor.next();
    }

    if (!table) continue;

    // tbody 内の全 <tr> を取得。2行ごとがひとつの試合
    const rows = table.find("tbody > tr").toArray();
    let matchIndex = 0;

    for (let i = 0; i < rows.length - 1; i += 2) {
      const infoRow = $(rows[i]!);
      // スコアがある行か確認
      if (!SCORE_PATTERN.test(infoRow.text())) continue;

      const cells = infoRow.children("td");
      const dateText = cells.eq(0).text().trim();
      const homeTeam = normalizeWikipediaTeamName(
        cells.eq(1).find("a").first().text().trim()
      );
      const awayTeam = normalizeWikipediaTeamName(
        cells.eq(3).find("a").first().text().trim()
      );

      if (!homeTeam || !awayTeam) {
        matchIndex++;
        continue;
      }

      matches.push({
        awayTeamName: awayTeam,
        dateKey: dateKeyFromText(dateText),
        dateText,
        homeTeamName: homeTeam,
        sectionId: `${roundId}_${matchIndex}`,
      });

      matchIndex++;
    }
  }

  return matches;
}
```

## 3. `lib/scrapers/wikipedia-urc-match-details.ts`（新規）

```ts
import { load } from "cheerio";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";
import { parseMatchEventsFromUrcDetailRowHtml } from "@/lib/scrapers/wikipedia-match-events";
import type { WikipediaClubMatchDetailSource, WikipediaClubMatchDetails } from "@/lib/scrapers/wikipedia-club-match-details";

const SCORE_PATTERN = /\b\d+\s*[–-]\s*\d+\b/;

function parseWikipediaUrcMatchDetailsHtml(
  html: string,
  source: WikipediaClubMatchDetailSource,
): WikipediaClubMatchDetails {
  const eventId = source.eventId;

  if (!eventId) {
    return { events: [], lineup: null };
  }

  // sectionId = "Round_N_matchIndex"
  const m = eventId.match(/^(Round_\d+)_(\d+)$/);
  if (!m) {
    return { events: [], lineup: null };
  }

  const [, roundId, indexStr] = m;
  const matchIndex = Number(indexStr);

  const $ = load(html);
  const heading = $(`h3#${roundId}`).first();
  if (!heading.length) return { events: [], lineup: null };

  const headingWrapper = heading.closest(".mw-heading");
  const start = headingWrapper.length ? headingWrapper : heading;
  let cursor = start.next();
  let table: ReturnType<typeof $> | null = null;

  while (cursor.length) {
    if (cursor.is("div.mw-heading")) break;
    if (cursor.is("table.mw-collapsible") || cursor.find("table.mw-collapsible").length) {
      table = cursor.is("table.mw-collapsible") ? cursor : cursor.find("table.mw-collapsible").first();
      break;
    }
    cursor = cursor.next();
  }

  if (!table) return { events: [], lineup: null };

  const rows = table.find("tbody > tr").toArray();
  // 各試合が 2 行ペア。matchIndex 番目のペアを探す
  let idx = 0;
  for (let i = 0; i < rows.length - 1; i += 2) {
    const infoRow = $(rows[i]!);
    if (!SCORE_PATTERN.test(infoRow.text())) continue;
    if (idx === matchIndex) {
      const detailRow = rows[i + 1];
      if (!detailRow) break;
      const detailRowHtml = $.html($(detailRow)) ?? "";
      return {
        events: parseMatchEventsFromUrcDetailRowHtml(detailRowHtml),
        lineup: null, // URC Wikipedia にラインアップデータなし
      };
    }
    idx++;
  }

  return { events: [], lineup: null };
}

export async function scrapeWikipediaUrcMatchDetails(
  source: WikipediaClubMatchDetailSource,
): Promise<WikipediaClubMatchDetails> {
  const response = await fetchWithPolicy(source.url);
  const html = await response.text();
  return parseWikipediaUrcMatchDetailsHtml(html, source);
}
```

## 4. `lib/scrapers/wikipedia-team-name-map.ts` の修正

URC のチーム名マップを追記する。実装前に DB の正確な表記を確認すること。

```ts
// URC（DB の teams.name の正確な表記を要確認）
"Stormers":          "Stormers",
"Lions":             "Lions",
"Sharks":            "Sharks",
"Bulls":             "Bulls",
"Leinster":          "Leinster Rugby",
"Munster":           "Munster Rugby",
"Ulster":            "Ulster Rugby",
"Connacht":          "Connacht Rugby",
"Scarlets":          "Scarlets",
"Dragons":           "Dragons",
"Cardiff":           "Cardiff Rugby",
"Ospreys":           "Ospreys",
"Zebre":             "Zebre Parma",
"Benetton":          "Benetton Rugby",
"Edinburgh":         "Edinburgh Rugby",
"Glasgow Warriors":  "Glasgow Warriors",
```

マッチング順: 完全一致 → マップ参照 → 部分一致（`teams.name.includes(wikiName)`）。

## 5. `scripts/seed-wikipedia-external-ids.ts` の修正

```ts
import { parseWikipediaUrcSeasonMatches } from "@/lib/scrapers/wikipedia-urc-season-parser";

// seedTarget 内のパーサー切り替え
const sourceMatches =
  target.family === "rugby-championship"
    ? parseWikipediaRcSeasonMatches(html)
    : target.family === "urc"
      ? parseWikipediaUrcSeasonMatches(html)
      : parseWikipediaSeasonMatches(html);
```

## 6. `scripts/backfill-club-match-details.ts` の修正

```ts
import { scrapeWikipediaUrcMatchDetails } from "@/lib/scrapers/wikipedia-urc-match-details";

// scrapeDetailsForMatch 内の分岐を更新
async function scrapeDetailsForMatch(
  match: MatchRow,
  source: NonNullable<ReturnType<typeof getWikipediaSource>>,
) {
  if (match.competition?.family === "rugby-championship") {
    return scrapeWikipediaRcMatchDetails(source);
  }
  if (match.competition?.family === "urc") {
    return scrapeWikipediaUrcMatchDetails(source);
  }
  return scrapeWikipediaClubMatchDetails(source);
}
```

## 実行手順（実装後に Owner が実行する）

```bash
set -a; source .env.production.local; set +a

# Step 1: DB の teams.name を確認
# SELECT name FROM teams WHERE name ILIKE '%leinster%' OR name ILIKE '%munster%' OR name ILIKE '%stormers%';

# Step 2: シード（dry-run）
pnpm tsx scripts/seed-wikipedia-external-ids.ts --family=urc --dry-run

# Step 3: matched > 0 を確認してから本番シード
pnpm tsx scripts/seed-wikipedia-external-ids.ts --family=urc

# Step 4: バックフィル（dry-run）
pnpm tsx scripts/backfill-club-match-details.ts --family=urc --dry-run --limit=5

# Step 5: 本番バックフィル
pnpm tsx scripts/backfill-club-match-details.ts --family=urc --limit=50
```

## 変更ファイル

- `lib/scrapers/wikipedia-match-events.ts`（`parseMatchEventsFromUrcDetailRowHtml` 追加）
- `lib/scrapers/wikipedia-urc-season-parser.ts`（新規）
- `lib/scrapers/wikipedia-urc-match-details.ts`（新規）
- `lib/scrapers/wikipedia-team-name-map.ts`（URC チーム名追記）
- `scripts/seed-wikipedia-external-ids.ts`（URC 用パーサー切り替え追加）
- `scripts/backfill-club-match-details.ts`（URC 用スクレイパー切り替え追加）

## 受け入れ条件

- [ ] `seed --family=urc --dry-run` で matched > 0（120件前後を想定）
- [ ] `seed --family=urc` 実行後、対象試合の `external_ids` に `wikipedia_url` と `wikipedia_event_id` が設定される
- [ ] `backfill --family=urc --dry-run --limit=5` で `events > 0` の試合が存在する
- [ ] URC 終了済み試合の詳細ページで得点経過グラフが表示される
- [ ] ラインアップセクションは非表示のまま（URC Wikipedia にラインアップデータなし）
- [ ] Premiership / RC 既存動作に影響なし
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

1. DB の `teams.name` で URC クラブの正確な表記を確認する（上記マップは仮）
2. URC 2025-26 の `competition.slug` が `"urc-2025-26"` であることを確認する
3. ラウンドの `<tr>` が必ず 2 行ペアか、例外（ヘッダ行・合計行等）がないか確認する
