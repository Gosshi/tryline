# PR #77 — リーグワン プレーオフ試合の取り込み対応

## 前提

`ingest-live-competitions` Cron が動作していること。

## 背景

`league-one.jp` のスケジュールページには、レギュラーシーズン（`?t1=3`）とは別に
プレーオフ（`?t1=0`）のページがある。
現在のスクレイパーはタイトルが `DIVISION 1` の試合のみを対象にしており、
プレーオフカードのタイトル `NTT JAPAN RUGBY LEAGUE ONE 2025-26 PLAY-OFFS` は
フィルターで除外されるため、DB に取り込まれない。

## スコープ

対象:
- `lib/ingestion/sources/league-one-live.ts`

対象外:
- `lib/scrapers/league-one-schedule.ts`（旧スクレイパー。使用されていないため変更しない）
- `lib/ingestion/live-competitions.ts`（変更不要）
- UI・大会ページ（変更不要。`family: 'league-one'` で同一大会として扱う）

## 変更内容

### 1. プレーオフ URL を追加

```ts
function buildScheduleUrl(season: string) {
  const { startYear } = parseSeason(season);
  return `${LEAGUE_ONE_BASE_URL}/en/schedule/?t1=3&year=${startYear}`;
}

function buildPlayoffsUrl(season: string) {
  const { startYear } = parseSeason(season);
  return `${LEAGUE_ONE_BASE_URL}/en/schedule/?t1=0&year=${startYear}`;
}
```

### 2. `parseLeagueOneLiveHtml` のタイトルフィルターを拡張

現在:
```ts
if (!/\bDIVISION\s*1\b/i.test(title)) {
  return;
}
```

変更後:
```ts
const isDivision1 = /\bDIVISION\s*1\b/i.test(title);
const isPlayoff = /\bPLAY[-\s]?OFFS?\b/i.test(title);

if (!isDivision1 && !isPlayoff) {
  return;
}
```

### 3. プレーオフの round / roundName 処理

`parseRound` はラウンド番号（`R1` 〜 `R18`）を抽出する。
プレーオフのタイトルには `R\d` 形式が含まれないため `null` になる（現在の動作）。

プレーオフカードでは `roundName` にステージ名を格納する:

```ts
// タイトルから "SEMI-FINAL"、"FINAL" などを抽出
function parsePlayoffStageName(title: string): string | null {
  const match = title.match(/PLAY[-\s]?OFFS?\s*(.+)/i);
  return match?.[1] ? normalizeWhitespace(match[1]) : "PLAY-OFFS";
}
```

`entries.push(...)` 内で:

```ts
const round = parseRound(title);
const roundName =
  round === null && isPlayoff ? parsePlayoffStageName(title) : null;

entries.push({
  // ...既存フィールド
  round,
  roundName,
});
```

### 4. `eventId` のフォールバックをプレーオフ対応

現在のフォールバック:
```ts
const eventId = idMatch
  ? `match_${idMatch[1]}`
  : `${round ?? "round"}_${slugEventPart(homeTeamName)}_v_${slugEventPart(awayTeamName)}`;
```

変更後（idMatch がない場合、プレーオフは `playoff_` プレフィックスを使う）:
```ts
const eventId = idMatch
  ? `match_${idMatch[1]}`
  : isPlayoff
    ? `playoff_${slugEventPart(homeTeamName)}_v_${slugEventPart(awayTeamName)}`
    : `${round ?? "round"}_${slugEventPart(homeTeamName)}_v_${slugEventPart(awayTeamName)}`;
```

### 5. `fetchLeagueOne202526` で両 URL を取得してマージ

```ts
export async function fetchLeagueOne202526(): Promise<ParsedLiveMatch[]> {
  const season = "2025-26";

  const [regularResponse, playoffResponse] = await Promise.all([
    fetchWithPolicy(buildScheduleUrl(season)),
    fetchWithPolicy(buildPlayoffsUrl(season)),
  ]);

  const regularMatches = parseLeagueOneLiveHtml(
    await regularResponse.text(),
    season,
  );
  const playoffMatches = parseLeagueOneLiveHtml(
    await playoffResponse.text(),
    season,
  );

  return [...regularMatches, ...playoffMatches].sort((a, b) =>
    a.kickoffAt.localeCompare(b.kickoffAt),
  );
}
```

`parseLeagueOneLiveHtml` は HTML のタイトルで `DIVISION 1` / `PLAY-OFFS` を自動判別するため、
正規シーズンページとプレーオフページの両方に同じ関数を使える。

## 留意点

- `league-one.jp` の robots.txt は `fetchWithPolicy` が確認済み
- プレーオフ試合は `League One 2025-26` 同一大会として扱われる（`competitionSlug: 'league-one-2025-26'`）
- プレーオフ試合の `round` は `null`、`external_ids.round_name` に "SEMI-FINAL" / "FINAL" 相当の文字列が入る
- `upsertCompetition` は `start_date` / `end_date` をマッチ一覧の最小・最大で上書きするため、
  プレーオフ日程が加わると `end_date` が自動的に延長される

## 完了の定義

- [ ] `league-one.jp/en/schedule/?t1=0&year=2025` のプレーオフカードが取得される
- [ ] プレーオフ試合が `matches` テーブルに `status='scheduled'` または `'finished'` で登録される
- [ ] プレーオフ試合の `external_ids.round_name` に "SEMI-FINAL" / "FINAL" などが入る
- [ ] レギュラーシーズン試合の取り込みに変化がない
- [ ] TypeScript エラーなし・`pnpm build` 通過
