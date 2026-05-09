# feat: match_phase（プレーオフ/リーグ戦/決勝）コンテキストをLLMに追加

## 背景

現在の LLM プロンプトはリーグ戦とプレーオフ決勝を区別しない。
プレーオフ決勝では優勝チームの旨をレビュー・プレビューに明記したい。
また Premiership の Wikipedia パーサーはプレーオフ試合を現在スキップしており、
DB にも入っていない。

本 PR は次の 2 点を同時に解決する:

1. `parsePremiershipLiveHtml` でプレーオフ試合を取り込む（現在は除外）
2. `round_name`（例: `"Final"`, `"Semi-final 1"`）をデータパイプライン全体に伝播し、
   LLM プロンプトで優勝文脈を明示する

---

## 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `lib/ingestion/sources/wikipedia-six-nations.ts` | `ParsedWikipediaMatch` 型に `roundName: string \| null` 追加 |
| `lib/ingestion/sources/wikipedia-premiership.ts` | プレーオフ試合の取り込みと `roundName` 抽出 |
| `lib/ingestion/live-ingest.ts` | `toExternalIds` に `round_name` 追加 |
| `lib/llm/stages/assemble.ts` | `external_ids` を select し `match_phase` を導出 |
| `lib/llm/types.ts` | `AssembledContentInput` に `match_phase` 追加 |
| `lib/llm/prompts/generate-recap.ts` | `match_phase` 活用、バージョン更新 |
| `lib/llm/prompts/generate-preview.ts` | `match_phase` 活用、バージョン更新 |

---

## 変更内容

### 1. `lib/ingestion/sources/wikipedia-six-nations.ts`

`ParsedWikipediaMatch` 型に `roundName` フィールドを追加する:

```typescript
export type ParsedWikipediaMatch = {
  // ...既存フィールド...
  round: number | null;
  roundName: string | null;  // 追加。Six Nations は常に null
  rawHtml: string;
};
```

Six Nations パーサー内で `ParsedWikipediaMatch` を生成する箇所に `roundName: null` を追加する（全試合）。

他の Wikipedia ソース（URC、Top14、SRP、Rugby Championship、PNC、Autumn Nations 等）も
`ParsedWikipediaMatch` または `ParsedLiveMatch` を生成する箇所すべてに `roundName: null` を追加し
型エラーを解消すること。

---

### 2. `lib/ingestion/sources/wikipedia-premiership.ts`

#### 2a. `isWithinRegularSeason` の役割を変更

現在: プレーオフ試合をスキップするフィルタとして使用。
変更後: スキップせず、セクション名を返す関数 `getHeadingInfo` に置き換える。

```typescript
// isWithinRegularSeason を削除し、以下の関数を追加する
function getHeadingInfo(
  $: ReturnType<typeof load>,
  block: ReturnType<ReturnType<typeof load>>,
): { round: number | null; roundName: string | null } {
  let cursor = block.prev();

  while (cursor.length > 0) {
    if (cursor.is("div.mw-heading")) {
      const h3 = cursor.find("h3").first();
      const h2 = cursor.find("h2").first();

      // h3 がラウンド番号パターン → リーグ戦
      const matched = h3.attr("id")?.match(ROUND_ID_PATTERN);
      if (matched) {
        return { round: Number(matched[1]), roundName: null };
      }

      // h2 または h3 のテキストがプレーオフ見出し
      const headingText = (h3.text() || h2.text()).trim();
      if (headingText) {
        return { round: null, roundName: headingText };
      }
    }

    cursor = cursor.prev();
  }

  return { round: null, roundName: null };
}
```

#### 2b. `parsePremiershipLiveHtml` のループを更新

```typescript
export function parsePremiershipLiveHtml(html: string): ParsedLiveMatch[] {
  const $ = load(html);
  const results: ParsedLiveMatch[] = [];

  for (const element of $("div.vevent.summary").toArray()) {
    const block = $(element);
    const { round, roundName } = getHeadingInfo($, block);  // 変更

    // isWithinRegularSeason によるスキップを削除（プレーオフも含める）

    const tables = block.find("table");
    // ...既存のパース処理は変更しない...

    results.push({
      // ...既存フィールド...
      round,
      roundName,  // 追加
    });
  }

  return results.sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));
}
```

---

### 3. `lib/ingestion/live-ingest.ts`（`toExternalIds`）

`ParsedLiveMatch` に `roundName` が追加されたので、`toExternalIds` でそれを保存する:

```typescript
function toExternalIds(
  source: LiveCompetitionSource,
  match: ParsedLiveMatch,
): Record<string, Json> {
  const externalIds: Record<string, Json> = {
    source: source.sourceLabel,
  };

  if (match.eventId) {
    externalIds.wikipedia_event_id = match.eventId;
  }

  if (match.round !== null && match.round !== undefined) {
    externalIds.wikipedia_round = match.round;
  }

  if (match.roundName) {
    externalIds.round_name = match.roundName;  // 追加
  }

  return externalIds;
}
```

---

### 4. `lib/llm/stages/assemble.ts`

#### 4a. `matches` select クエリに `external_ids` を追加

```typescript
const { data: match, error: matchError } = await db
  .from("matches")
  .select(
    `
      id,
      competition_id,
      kickoff_at,
      status,
      venue,
      home_score,
      away_score,
      external_ids,
      competition:competitions(id, name, season, family),
      home_team:teams!matches_home_team_id_fkey(id, name, short_code, country),
      away_team:teams!matches_away_team_id_fkey(id, name, short_code, country)
    `,
  )
  .eq("id", matchId)
  .single();
```

#### 4b. `match_phase` を導出するヘルパーを追加

```typescript
type MatchPhase = "league" | "playoff_semifinal" | "playoff_final" | "playoff_other";

function deriveMatchPhase(externalIds: unknown): MatchPhase | null {
  if (!externalIds || typeof externalIds !== "object" || Array.isArray(externalIds)) {
    return null;
  }

  const ids = externalIds as Record<string, unknown>;
  const roundName =
    typeof ids.round_name === "string" ? ids.round_name.toLowerCase() : null;
  const round =
    typeof ids.wikipedia_round === "number" ? ids.wikipedia_round : null;

  if (round !== null) {
    return "league";
  }

  if (!roundName) {
    return null;
  }

  if (
    roundName.includes("final") &&
    !roundName.includes("semi") &&
    !roundName.includes("quarter")
  ) {
    return "playoff_final";
  }

  if (roundName.includes("semi")) {
    return "playoff_semifinal";
  }

  return "playoff_other";
}
```

#### 4c. `assembleMatchContentInput` の戻り値に `match_phase` を追加

```typescript
return {
  match: {
    // ...既存フィールド...
  },
  match_phase: deriveMatchPhase(match.external_ids),  // 追加
  // ...他の既存フィールド...
};
```

---

### 5. `lib/llm/types.ts`

`AssembledContentInput` に `match_phase` を追加:

```typescript
export type AssembledContentInput = {
  match: { ... };
  match_phase: "league" | "playoff_semifinal" | "playoff_final" | "playoff_other" | null;  // 追加
  recent_form: { ... };
  // ...他の既存フィールド...
};
```

---

### 6. `lib/llm/prompts/generate-recap.ts`

`PROMPT_VERSION` を `"recap@2.0.0"` に変更する。

`buildGenerateRecapPrompt` 内に `matchPhaseBlock` を追加する:

```typescript
const matchPhaseBlock = (() => {
  const phase = assembled.match_phase;
  const homeScore = assembled.match.home_score;
  const awayScore = assembled.match.away_score;
  const winner =
    homeScore !== null && awayScore !== null && homeScore !== awayScore
      ? homeScore > awayScore
        ? assembled.match.home_team?.name
        : assembled.match.away_team?.name
      : null;
  const competitionLabel = [
    assembled.match.competition?.name,
    assembled.match.competition?.season,
  ]
    .filter(Boolean)
    .join(" ");

  if (phase === "playoff_final" && winner) {
    return `この試合は${competitionLabel}の決勝戦です。${winner}が優勝チームとなりました。レビュー冒頭でこの事実を明記し、優勝の意義・歴史的文脈にも触れること。`;
  }

  if (phase === "playoff_final") {
    return `この試合は${competitionLabel}の決勝戦です。レビュー冒頭で決勝戦としての意義を明記すること。`;
  }

  if (phase === "playoff_semifinal") {
    return `この試合はプレーオフ準決勝です。決勝進出の意義と敗退チームへの示唆をレビューに含めること。`;
  }

  if (phase === "playoff_other") {
    return `この試合はプレーオフ戦です。その意義と文脈をレビューに含めること。`;
  }

  return "";
})();
```

プロンプト配列の `structureInstruction` の直後に `matchPhaseBlock` を追加する:

```typescript
return [
  "あなたは日本語のラグビー専門編集者です。試合レビューをマークダウンで作成してください。",
  structureInstruction,
  matchPhaseBlock,  // 追加
  "各セクションが指定範囲の下限を下回った場合は書き足すこと。",
  // ...既存フィールド（変更なし）...
].filter(Boolean).join("\n\n");
```

---

### 7. `lib/llm/prompts/generate-preview.ts`

`PROMPT_VERSION` を `"preview@1.9.0"` に変更する。

`buildGeneratePreviewPrompt` 内に `matchPhaseBlock` を追加する:

```typescript
const matchPhaseBlock = (() => {
  const phase = assembled.match_phase;
  const competitionLabel = [
    assembled.match.competition?.name,
    assembled.match.competition?.season,
  ]
    .filter(Boolean)
    .join(" ");

  if (phase === "playoff_final") {
    return `この試合は${competitionLabel}の決勝戦です。勝者がチャンピオンとなります。プレビュー冒頭でこの一戦の重みを強調し、タイトル争いの文脈を示すこと。`;
  }

  if (phase === "playoff_semifinal") {
    return `この試合はプレーオフ準決勝です。決勝進出をかけた一戦としての緊張感と文脈をプレビューに反映すること。`;
  }

  if (phase === "playoff_other") {
    return `この試合はプレーオフ戦です。その意義と文脈をプレビューに含めること。`;
  }

  return "";
})();
```

プロンプト配列の `structureInstruction` の直後に挿入する。

---

## 実装上の注意

- `ParsedWikipediaMatch` に `roundName` を追加したとき、型を満たすため `ParsedLiveMatch` を
  返すすべてのパーサーに `roundName: null` を追加する必要がある。
  対象: Six Nations、URC、Top14、SRP、Rugby Championship、PNC、Autumn Nations、**League One**。
  League One は Wikipedia ソースではないため `round_name` が DB に書かれることはなく、
  `match_phase` は常に `null` になる（機能的影響なし）。型エラーが出る箇所をすべて修正すること
- Premiership の `isWithinRegularSeason` を撤廃すると、それまで DB に存在しなかった
  プレーオフ試合が新たに ingest される。初回 cron 実行時に試合数が増える想定
- `PROMPT_VERSION` が `recap@2.0.0` / `preview@1.9.0` になるため、再生成は
  `--from-version=recap@1.9.0 --family=premiership` などで絞って実行する
- `deriveMatchPhase` のキーワード判定（"final", "semi"）は英語 Wikipedia 見出し前提
- `matchPhaseBlock` は空文字列を返す場合、`.filter(Boolean)` で除去されるため
  リーグ戦では何も追加されない（既存動作に影響なし）

---

## 完了条件

- [ ] `pnpm tsc --noEmit` パス
- [ ] `pnpm build` パス
- [ ] `ParsedWikipediaMatch` に `roundName: string | null` が追加されている
- [ ] `parsePremiershipLiveHtml` がプレーオフ試合も返す（`isWithinRegularSeason` 撤廃）
- [ ] `toExternalIds` が `round_name` を `external_ids` に保存する
- [ ] `assembleMatchContentInput` が `match_phase` を返す
- [ ] `AssembledContentInput` に `match_phase` フィールドが追加されている
- [ ] `generate-recap.ts` の `PROMPT_VERSION` が `"recap@2.0.0"` になっている
- [ ] `generate-preview.ts` の `PROMPT_VERSION` が `"preview@1.9.0"` になっている
- [ ] 決勝戦の `matchPhaseBlock` が優勝チーム名を含む文字列を返す

---

## 参照ファイル

| ファイル | 参照目的 |
|---------|---------|
| `lib/ingestion/sources/wikipedia-six-nations.ts` | `ParsedWikipediaMatch` 型の現状（変更対象） |
| `lib/ingestion/sources/wikipedia-premiership.ts` | `isWithinRegularSeason` / `parseRoundFromHeading` の現状（変更対象） |
| `lib/ingestion/live-ingest.ts` | `toExternalIds` の現状（変更対象） |
| `lib/llm/stages/assemble.ts` | `assembleMatchContentInput` の現状（変更対象） |
| `lib/llm/types.ts` | `AssembledContentInput` の型定義（変更対象） |
| `lib/llm/prompts/generate-recap.ts` | 現行: `recap@1.9.0`（変更対象） |
| `lib/llm/prompts/generate-preview.ts` | 現行: `preview@1.8.0`（変更対象） |
