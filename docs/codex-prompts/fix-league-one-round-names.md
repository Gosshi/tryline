# fix-league-one-round-names: 節番号の保存・選手名の日本語化・競技別カタカナ対応

## 変更概要

1. League One インポートで `round`（節番号）が保存されていないのを修正
2. League One 選手名を日本語版サイト（`/ja/`）から取得するよう変更
3. LLM プロンプトの選手名表記を競技ごとに切り替える
   - League One（国内）: 日本語名、外国人選手はカタカナ
   - 海外試合: 選手名をカタカナで記載

---

## 変更 1: `round` の保存（`scripts/import-league-one-full.ts`）

`buildExternalIds` 関数に `round` を追加する:

```typescript
// 変更前
function buildExternalIds(entry: LeagueOneScheduleEntry): Record<string, Json> {
  return {
    league_one_match_id: entry.league_one_match_id,
    match_url: entry.match_url,
    source: SOURCE,
  };
}

// 変更後
function buildExternalIds(entry: LeagueOneScheduleEntry): Record<string, Json> {
  return {
    league_one_match_id: entry.league_one_match_id,
    match_url: entry.match_url,
    round: entry.round,
    source: SOURCE,
  };
}
```

---

## 変更 2: 日本語選手名（`lib/scrapers/league-one-match.ts`）

`fetchLeagueOneMatchDetail` の URL を `/en/` から `/ja/` に変更する:

```typescript
// 変更前
export async function fetchLeagueOneMatchDetail(
  matchId: number,
): Promise<LeagueOneMatchDetail> {
  const response = await fetchWithPolicy(
    `${LEAGUE_ONE_BASE_URL}/en/match/${matchId}/print`,
  );
  ...
}

// 変更後
export async function fetchLeagueOneMatchDetail(
  matchId: number,
): Promise<LeagueOneMatchDetail> {
  const response = await fetchWithPolicy(
    `${LEAGUE_ONE_BASE_URL}/ja/match/${matchId}/print`,
  );
  ...
}
```

`LEAGUE_ONE_BASE_URL` は `"https://league-one.jp"` のまま変更不要。

日本語版ページのHTMLセレクターが英語版と同じ構造かを確認し、異なる場合は `parseLeagueOneMatchPrintHtml` も対応する。
基本的には同じ構造のはずだが、テキスト内容（ヘッダー等）が日本語になっている点に注意。

---

## 変更 3: LLM プロンプトへの `competition.family` 追加

### 3-1. `lib/llm/types.ts`

`AssembledContentInput` の `competition` に `family` を追加:

```typescript
// 変更前
competition: {
  id: string;
  name: string;
  season: string;
} | null;

// 変更後
competition: {
  id: string;
  name: string;
  season: string;
  family: string | null;
} | null;
```

### 3-2. `lib/llm/stages/assemble.ts`

`assembleMatchContentInput` の競技クエリに `family` を追加:

```typescript
// 変更前
competition:competitions(id, name, season),

// 変更後
competition:competitions(id, name, season, family),
```

`return` ブロックの `competition` にも `family` を含める:

```typescript
// 変更前
competition: match.competition,

// 変更後
competition: match.competition
  ? {
      id: match.competition.id,
      name: match.competition.name,
      season: match.competition.season,
      family: match.competition.family ?? null,
    }
  : null,
```

### 3-3. `lib/llm/prompts/generate-preview.ts` と `generate-recap.ts`

両ファイルの選手名に関する固定指示行を、`assembled.match.competition?.family` に基づく動的指示に変更する。

**変更前（両ファイル共通）:**
```typescript
"選手名・チーム名は英語表記のまま使用すること（カタカナ変換しない）。",
```

**変更後:**
```typescript
assembled.match.competition?.family === "league-one"
  ? "選手名は日本語表記を使用すること。外国人選手はカタカナで記載すること（例: Brodie Retallick → ブロディ・レタリック）。チーム名は日本語または通称表記を使用すること。"
  : "選手名はカタカナで記載すること（例: Marcus Smith → マーカス・スミス、Owen Farrell → オウェン・ファレル）。チーム名は英語表記のまま。",
```

配列内の三項演算子の型が `string` になるよう、前後の文字列と同じ形式で記述すること。

---

## 完了条件

- `pnpm tsc --noEmit` パス
- League One のインポートを再実行したとき、`external_ids.round` に節番号が入ること
- `/ja/` 版から取得した選手名が日本語（カタカナまたは漢字混じり）で保存されること
- League One の試合で生成されたコンテンツの選手名が日本語表記になること
- 海外試合（Six Nations 等）で生成されたコンテンツの選手名がカタカナになること

## ブランチ・PR

- ブランチ: `fix/league-one-round-and-player-names`
- PR タイトル: `Fix: League One round storage, Japanese player names, per-competition name style`
