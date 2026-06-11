# feat-recap-stats-sourced-facts

## 背景

recap の深み不足の一因は、本物の試合スタッツ（ポゼッション・テリトリー・タックル数等）が入力に存在しないこと。構造化ソース（Wikipedia）にはこれらが無いが、公式サイトやメディアの試合レポートには記載されている。

現状の `buildSearchPrompt`（`lib/llm/sourced-facts/fetch.ts` L119-160）は content_type に関わらず **preview 向けの検索意図**（チームニュース・負傷・スタメン変更・注目選手）を使っており、recap で取るべき「試合後の数値スタッツ」「公式 MOM」を狙っていない。

副次効果: 公式 MOM を sourced_facts で取得できれば、recap の MOM が LLM 推論で公式と食い違う既知問題（リーグワン決勝で誤記・手修正した件）の恒久対策になる。

## スコープ

対象:
- `lib/llm/sourced-facts/fetch.ts`: `buildSearchPrompt` の recap 分岐追加・`SEARCH_PROMPT_VERSION` バンプ
- `lib/llm/sourced-facts/allowlist.ts`: メディアドメイン追加（Owner 判断分のみ）

対象外:
- 公式マッチセンターの直接スクレイピング（B 案・別調査）
- 生成プロンプト側の変更（sourced_facts ブロックは既に統計を扱える。#404 でゼロ件時ガードも済み）
- 既存 recap の再生成（バッチ再生成 C でまとめて反映）

## データモデル変更

なし（既存 `match_sourced_facts` を使用）。

## LLM 連携

- `SEARCH_PROMPT_VERSION = "sourced-facts@1.1.0"`（from 1.0.0）。バージョン文字列がキャッシュキーに含まれる場合、recap 分は新規取得になる（コスト: web search 1回/試合。バッチ再生成 C と同時実行なら追加コストはその範囲内）
- 取得した数値は QA の sourced_facts grounding と捏造ガード（`containsUnsupportedStatistic` の supportedFacts 照合）に自動で乗る — 既存機構の変更不要

## 変更詳細

### 1. `buildSearchPrompt` の content_type 分岐

`Search intent:` ブロックを分岐する。preview は現行のまま、recap は以下に差し替え:

```typescript
const searchIntent =
  contentType === "recap"
    ? [
        "Search intent (post-match):",
        "- official post-match statistics: possession %, territory %, tackle counts, carries, metres gained, lineout/scrum success, turnovers, penalty counts",
        "- the official Player of the Match / Man of the Match award (only if officially announced; include the awarding body)",
        "- notable records or milestones set in this match (e.g., career try record, debut)",
        "- significant injuries sustained during the match",
        "- brief post-match comments from head coaches or captains (paraphrased, max 15 words per quote)",
      ].join("\n")
    : [
        "Search intent:",
        "- latest team news",
        "- injuries",
        "- latest lineup changes",
        "- player news such as retirements, transfers, and availability",
        "- key players",
        "- stakes and knockout/final context",
      ].join("\n");
```

Rules ブロックに recap 時のみ1行追加:

```
- For numeric statistics, state the stat name and both teams' values exactly as reported (e.g., "Possession: Glasgow 54% - Bulls 46%"). Never estimate or round.
```

既存 Rules（DB 権威領域の除外・日付明記・15語引用上限）は両 content_type で維持。

### 2. `SEARCH_PROMPT_VERSION` を `"sourced-facts@1.1.0"` に変更

### 3. `allowlist.ts` — メディアドメイン追加

`MEDIA_DOMAINS` に追加:

```typescript
const MEDIA_DOMAINS = [
  "rugbypass.com",
  "planetrugby.com",
  "rugbyasia247.com",
  "bbc.com",
  "bbc.co.uk",
] as const;
```

注: sourced_facts は OpenAI の web search 経由であり自前スクレイプではない。許可リストは「引用元として受け入れるドメイン」のフィルタ。言い換え必須・15語上限の既存ルールが適用される。

## 受け入れ条件

1. `buildSearchPrompt(match, "recap")` の出力に「post-match statistics」「Player of the Match」が含まれ、preview 向け意図（lineup changes 等）が含まれない（単体テスト）
2. `buildSearchPrompt(match, "preview")` の出力が現行と同一（回帰テスト）
3. `SEARCH_PROMPT_VERSION` が `sourced-facts@1.1.0`
4. `isAllowedSourcedFactDomain("bbc.com")` / `("www.bbc.co.uk")` が true（単体テスト）
5. `pnpm test` 全体が通る・TypeScript strict エラーなし

## 未解決の質問

- BBC 追加の最終判断は Owner（引用は言い換え・15語上限で著作権配慮済みの設計だが、方針として外すなら `MEDIA_DOMAINS` から2行削るだけ）
- recap の sourced_facts 取得タイミング: 既存実装が finished 試合でも検索を実行するか確認（preview 用の freshness window が recap をブロックしないか）。ブロックする場合は recap 分岐の追加が必要 — Codex が実装時に `loadSourcedFactsForMatch` を確認すること
