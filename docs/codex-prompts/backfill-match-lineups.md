# Codex Prompt: backfill-match-lineups

## 目的

Wikipedia の Six Nations 大会ページ（例: `https://en.wikipedia.org/wiki/2025_Six_Nations_Championship`）から全試合のラインアップ（先発 15 + ベンチ 8）を取得し、`match_lineups` テーブルに一括 upsert するバックフィルスクリプトを実装する。

## 背景と制約

- Wikipedia の Six Nations ページには **試合個別ページが存在しない**。大会ページの各 Round セクション内に vevent ブロックとして試合が並んでいる。
- `backfill-match-events.ts` が同じページ構造を使って試合イベントを取得しているので、**そのスクリプトを設計の手本にすること**。
- `lib/scrapers/fetcher.ts` の `fetchWithPolicy` を使うこと（robots.txt 遵守・レート制限・リトライ自動適用）。

## Wikipedia ページの HTML 構造（実測済み）

**重要**: ラインアップ表は `div.vevent.summary` の**内部には存在しない**。

実際の DOM 構造:

```
div.vevent.summary          ← スコア・日時・会場
table (class="")            ← ラインアップ表（vevent の直後の兄弟要素）
table (class="")            ← Player of the Match・審判情報
p
ul
hr
div.vevent.summary          ← 次の試合
...
```

**ラインアップ表の内部構造:**

```
<table>
  <tr>  ← Row 0: 220+ cells のサマリー行（cheerio のレンダリングアーティファクト）
    <td>FB 15 Thomas Ramos ... [全ホーム選手連結テキスト]</td>
    <td>FB</td><td>15</td><td>Thomas Ramos</td><td></td><td>67'</td>
    <td>RW</td><td>14</td><td>Théo Attissogbé</td>
    ... (ホーム全選手分続く)
    <td>Coach:</td><td>Fabien Galthié</td><td></td>
    <td>[全アウェイ選手連結テキスト]</td>   ← ここからアウェイ
    <td>FB</td><td>15</td><td>Liam Williams</td>
    ...
  </tr>
  <tr></tr>  ← Row 1: 空行
  <tr>  ← Row 2: FB 15 ホームFB（3〜5 cells）
    <td>FB</td><td>15</td><td>Thomas Ramos</td><td></td><td>67'</td>
  </tr>
  <tr><td>RW</td><td>14</td><td>Théo Attissogbé</td></tr>
  <tr><td>OC</td><td>13</td><td>Pierre-Louis Barassi</td></tr>
  ...（ホームスターター 1〜15）
  <tr><td colspan="...">Replacements:</td></tr>  ← セパレータ
  ...（ホームベンチ 16〜23）
  <tr><td>Coach:</td><td>Fabien Galthié</td></tr>
  <tr>  ← アウェイ開始: 再び FB 15 から
    <td>FB</td><td>15</td><td>Liam Williams</td><td>RW</td>...
  </tr>
  ...（アウェイ 1〜23）
  <tr><td>Coach:</td><td>Warren Gatland</td></tr>
</table>
```

**個別選手行のセル構成（Row 2 以降）:**
- `td[0]`: ポジションコード（"FB", "RW", "OC", "HK" 等 2〜3 文字）
- `td[1]`: 背番号（"1"〜"23" の整数文字列）
- `td[2]`: 選手名（テキストまたは `<a>` タグ）
- `td[3]`（任意）: 空文字またはキャプテン表記
- `td[4]`（任意）: 交代分数 ("67'" 等) または空

## 実装内容

### 1. `lib/ingestion/sources/wikipedia-six-nations.ts` の変更

`ParsedWikipediaMatch` 型に `lineupTableHtml: string | null` フィールドを追加する。

`parseWikipediaSixNationsHtml` 内の vevent 処理ブロックで、`div.vevent.summary` を検出した直後に **次の兄弟要素のうち最初の `table`（class なし）** を取得し `lineupTableHtml` として格納する。

```typescript
// vevent 検出後
const nextTable = cursor.nextAll("table").first();
const lineupTableHtml = nextTable.length > 0 ? $.html(nextTable) : null;

parsedMatches.push({
  // ... 既存フィールド,
  lineupTableHtml,
});
```

> **注意**: `backfill-match-events.ts` は `lineupTableHtml` を使わないので、追加フィールドへの参照変更は不要（型変更のみ追随させること）。

### 2. `lib/scrapers/wikipedia-lineups.ts` に追加する関数

既存の型定義（`WikipediaLineupPlayer`, `WikipediaMatchLineup`）はそのまま使う。以下の新関数を追加する:

```typescript
/**
 * vevent 直後のラインアップ table の outerHTML からホーム・アウェイを抽出する。
 *
 * Row 0（220+ cells のサマリー行）と空行はスキップする。
 * 個別選手行は td[1] が 1〜23 の整数の行として識別する。
 * ホーム・アウェイの境界は「背番号 15 が 2 回目に現れた時点」で検出する。
 *
 * ラインアップ行が 1 件も取れない場合は null を返す。
 */
export function parseLineupFromTableHtml(
  tableHtml: string,
  sourceUrl: string,
): WikipediaMatchLineup | null
```

**実装アルゴリズム:**

```typescript
export function parseLineupFromTableHtml(
  tableHtml: string,
  sourceUrl: string,
): WikipediaMatchLineup | null {
  const $ = cheerio.load(tableHtml);
  const rows = $("table tr").toArray();

  const homePlayers: WikipediaLineupPlayer[] = [];
  const awayPlayers: WikipediaLineupPlayer[] = [];
  let parsingAway = false;
  let seenJersey15 = false;

  for (const row of rows) {
    const cells = $(row).find("td");

    // Row 0（サマリー巨大行）と空行をスキップ
    if (cells.length > 10 || cells.length < 3) {
      continue;
    }

    const jerseyText = normalizeWhitespace(cells.eq(1).text());
    const jersey = Number(jerseyText);

    if (!Number.isInteger(jersey) || jersey < 1 || jersey > 23) {
      continue; // Replacements: / Coach: 等のセパレータ行をスキップ
    }

    // 背番号 15 が 2 回目に現れたらアウェイ開始
    if (jersey === 15) {
      if (seenJersey15) {
        parsingAway = true;
      } else {
        seenJersey15 = true;
      }
    }

    const name = normalizeWhitespace(
      cells.eq(2).find("a").first().text() || cells.eq(2).text(),
    );

    if (!name) {
      continue;
    }

    const player = { jersey_number: jersey, name };

    if (parsingAway) {
      awayPlayers.push(player);
    } else {
      homePlayers.push(player);
    }
  }

  if (homePlayers.length === 0 && awayPlayers.length === 0) {
    return null;
  }

  return {
    announced_at: new Date().toISOString(),
    away_players: awayPlayers,
    home_players: homePlayers,
    source_url: sourceUrl,
  };
}
```

### 3. `scripts/backfill-match-lineups.ts`

`backfill-match-events.ts` の構造を踏襲して実装する。

```
Usage: node --env-file=.env.local tools/run-ts.cjs scripts/backfill-match-lineups.ts [--year=2025] [--dry-run]
```

**処理フロー:**

1. `--year`（省略時は全 Six Nations）で対象コンペティションを取得（`slug LIKE 'six-nations-%'`）
2. 対象コンペティションごとに `six-nations-<year>` → `https://en.wikipedia.org/wiki/<year>_Six_Nations_Championship` の URL を組み立て
3. `fetchWithPolicy` でページ取得 → `parseWikipediaSixNationsHtml` で vevent リストを取得（各要素の `lineupTableHtml` を使う）
4. DB から `finished` な試合を取得（`home_team.name` と `away_team.name` を JOIN、`match_lineups(id)` も SELECT して既登録チェックに使う）
5. **ラインアップが既に登録済みの試合はスキップ**（`match_lineups` に該当 `match_id` のレコードが存在する場合）
6. vevent の `homeTeamName` + `awayTeamName` で DB 試合と突き合わせ
7. `lineupTableHtml` が null の場合はスキップしてログ出力
8. `parseLineupFromTableHtml(lineupTableHtml, pageUrl)` が null の場合もスキップしてログ出力
9. `ensurePlayerIds` で `players` テーブルに upsert（`app/api/cron/ingest-lineups/route.ts` と同じロジック。スクリプト内にインライン実装する）
10. `match_lineups` に upsert（`onConflict: "match_id,team_id,jersey_number"`）
11. 大会間で `sleep(1000)` を挟む（レート制限配慮）

**型定義（スクリプト内ローカル）:**

```typescript
type CompetitionRow = { id: string; season: string; slug: string };
type MatchRow = {
  id: string;
  competition_id: string;
  home_team_id: string;
  away_team_id: string;
  home_team: { name: string } | null;
  away_team: { name: string } | null;
  match_lineups: Array<{ id: string }>;
};
```

**ログ出力例:**

```
Target finished Six Nations matches without lineups: 15
[dry-run] 2025 France v Wales: home=23 away=23
Inserted lineups for 2025 France v Wales: home=23 away=23
Lineup not found for 2025 Italy v Wales (skipped)
Backfill complete: target_matches=15 with_lineups=14 skipped=1 dry_run=false
```

## 参照ファイル

設計パターン:
- `scripts/backfill-match-events.ts` — 全体構造のテンプレート（**必ず読むこと**）
- `app/api/cron/ingest-lineups/route.ts` — `ensurePlayerIds` ロジック（**必ず読むこと**）
- `lib/ingestion/sources/wikipedia-six-nations.ts` — `parseWikipediaSixNationsHtml`（vevent 抽出・変更対象）
- `lib/scrapers/wikipedia-lineups.ts` — 既存の型定義・`normalizeWhitespace`（変更対象）
- `lib/scrapers/fetcher.ts` — `fetchWithPolicy`

DB:
- `match_lineups`: `(match_id, team_id, jersey_number)` unique
- `players`: `(team_id, name)` unique

## 完了条件

- [ ] `pnpm typecheck` が通る
- [ ] `pnpm test` が全グリーン（`ParsedWikipediaMatch` 型変更への追随確認）
- [ ] `--dry-run --year=2025` で実行し、15 試合それぞれの `home=23 away=23` がログに出る
- [ ] `--year=2025` で実行後、`match_lineups` テーブルに行が増えている
- [ ] ラインアップ未掲載の試合はエラーにならずスキップされる
- [ ] `match_lineups` 登録済みの試合は再実行でスキップされる（冪等）
