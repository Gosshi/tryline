# fix-assemble-add-scores: LLM に最終スコアを渡す

## 背景

`lib/llm/stages/assemble.ts` の Supabase クエリに `home_score` / `away_score` が含まれておらず、
LLM は `match_events` を自分で数えて勝者を判断している。
イベントの数え間違いや学習データのバイアスで勝者誤認が発生する。

スコアを明示的に渡すことで LLM が誤認する余地をなくす。

## 変更ファイル

### 1. `lib/llm/types.ts`

`AssembledContentInput` の `match` フィールドに `home_score` / `away_score` を追加:

```typescript
match: {
  id: string;
  kickoff_at: string;
  status: string;
  venue: string | null;
  home_score: number | null;  // 追加
  away_score: number | null;  // 追加
  competition: { ... } | null;
  home_team: { ... } | null;
  away_team: { ... } | null;
};
```

### 2. `lib/llm/stages/assemble.ts`

Supabase クエリに `home_score, away_score` を追加:

```typescript
const { data: match } = await db
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
      competition:competitions(id, name, season, family),
      home_team:teams!matches_home_team_id_fkey(id, name, short_code, country),
      away_team:teams!matches_away_team_id_fkey(id, name, short_code, country)
    `,
  )
```

`return` ブロックの `match:` に追加:

```typescript
match: {
  id: match.id,
  kickoff_at: match.kickoff_at,
  status: match.status,
  venue: match.venue,
  home_score: match.home_score,   // 追加
  away_score: match.away_score,   // 追加
  competition: ...,
  home_team: match.home_team,
  away_team: match.away_team,
},
```

### 3. `lib/llm/prompts/generate-recap.ts` と `generate-preview.ts`

プロンプト配列に勝者明示の指示を追加（`試合データ:` の行の直前）:

```typescript
"試合結果はデータ内の home_score と away_score が正確な最終スコアである。スコアが高いチームが勝者。この事実を文章の根拠として使うこと。",
```

`PROMPT_VERSION` をそれぞれ `recap@1.7.0` / `preview@1.6.0` に上げること。

## 完了条件

- `pnpm tsc --noEmit` パス
- `AssembledContentInput.match` に `home_score`, `away_score` が含まれる
- テスト（`tests/llm/` 以下）がある場合は型エラーなく通ること

## ブランチ・PR

- ブランチ: `fix/assemble-add-scores`
- PR タイトル: `Fix: pass home_score/away_score to LLM to prevent winner mismatch`
