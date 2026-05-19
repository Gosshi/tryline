# PR #73 — リーグワンの英語コンテンツ生成をパイプラインに追加

## 前提

PR #72（`language` カラム追加）が完了していること。

## 背景

リーグワン（`family = 'league-one'`）の試合について、日本語コンテンツ生成後に
英語版（recap・preview）も生成して `match_content` に保存する。
英語コンテンツは日本語と同じパイプライン構造（抽出 → ナラティブ → QA）を使い、
プロンプトを英語に切り替えることで生成する。

## スコープ

対象:
- `lib/llm/pipeline.ts`
- `lib/llm/stages/generate-narrative.ts`
- `lib/llm/stages/qa.ts`（必要な場合）
- `lib/cron/orchestrate.ts`

対象外:
- 他大会への英語対応は行わない
- UI・X 投稿は別 PR

## 実装方針

### パイプラインへの `language` パラメータ追加

`generateMatchContent` のシグネチャを拡張:

```ts
export async function generateMatchContent(
  matchId: string,
  contentType: ContentType,
  language: "ja" | "en" = "ja",
): Promise<PipelineResult>
```

### upsert に `language` を含める

```ts
const { error: upsertError } = await db.from("match_content").upsert(
  {
    match_id: matchId,
    content_type: contentType,
    content_md_ja: finalNarrative,
    language, // "ja" or "en"
    model_version: modelVersion,
    prompt_version: promptVersion,
    status: persistedStatus,
    qa_scores: finalQa,
    generated_at: new Date().toISOString(),
  },
  {
    onConflict: "match_id,content_type,language",
  },
);
```

### ナラティブ生成プロンプトの英語切り替え

`generateNarrative` に `language` を渡し、`language === 'en'` のときは英語プロンプトを使う:

- "You are a rugby journalist. Write a detailed match {contentType} in English."
- 日本語プロンプトと同等の構造（戦術分析・選手評価・試合の流れ）
- 出力は英語 Markdown

### orchestrate でのリーグワン英語生成

```ts
// lib/cron/orchestrate.ts — 日本語生成の後に追加

if (match.competition.family === "league-one") {
  await generateContent(matchId, "preview", "en");
  // recap は試合完了後のみ（既存の isCompleted 判定と同じ条件）
  if (isCompleted) {
    await generateContent(matchId, "recap", "en");
  }
}
```

`generateContent` のシグネチャも `language` 引数を受け取るよう更新する。

## 完了の定義

- [ ] リーグワンの試合で日本語生成後に英語 recap/preview が生成される
- [ ] 英語コンテンツが `match_content` に `language = 'en'` で保存される
- [ ] 他大会では英語生成が実行されない
- [ ] 日本語コンテンツの生成・保存フローに変化がない
- [ ] TypeScript エラーなし・`pnpm build` 通過
