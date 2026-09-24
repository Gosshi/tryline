# レビューの本文プロンプトを B2 に切り替える

## 背景

記事プロンプトの A/B 比較（`specs/feat-content-prompt-ab-experiment.md`、`specs/feat-content-prompt-b2.md`）の結果、**レビューは B2 を本番に入れる**と Owner が決めた（2026-09-25）。

- **B1 対 A（2026-09-24、4 試合 8 本）:** GPT-6 が名前を伏せて比べ、4 組すべてで B を選んだ。Claude Code の事実照合では、A は 3 本で計 5 件の誤り（予想スコア、根拠のない因果・心理、区間のトライ数、漢字の推測）、B は 0 件。
- **B2（2026-09-25、固定入力は B1 と同じ）:** レビュー 2 本とも誤り 0 件で、QA に合格した（裏付け 5 点）。**有料部分（ターニングポイント）は本文の約 7 割**（1,055 / 1,456 字、1,020 / 1,528 字）で、B1 の弱点だった有料部分の短さ（695 字、818 字）が解消した。
- **プレビューは A のまま**にする。B2 のプレビューは 2 本とも QA の下限 1,500 字に届かず、1 本に重大な誤り（抽出結果の「4 勝 1 敗」をそのまま写した）があった。

## スコープ

**対象**
- 日本語のレビューで、得点イベント（`match_events`）が 1 件以上ある試合は、本番の本文生成で B2（`lib/llm/prompts/variant-b/generate-recap-b.ts`）を使う。
- B2 の版番号を本番用にする。

**対象外**
- プレビュー（A のまま）。
- 得点イベントが 0 件のレビュー（B2 は得点イベントを前提にしているので A のまま。B2 のビルダーは 0 件の入力で例外を投げる）。
- 英語のレビュー（A のまま）。
- QA の採点基準とガード（変えない。下の「注意」を参照）。
- 既存記事の作り直し（しない。版番号を上げても既存記事は変わらない）。

## データモデル変更

なし。

## API サーフェス

### 1. 本番の既定の選び方（`lib/llm/stages/generate-narrative.ts`）

- 新しい関数を足す。
  ```ts
  export function selectProductionPromptVariant(options: {
    contentType: ContentType;
    language: ContentLanguage;
    hasEvents: boolean;
  }): "A" | "B"
  ```
  - `contentType === "recap"`、`language === "ja"`、`hasEvents === true` のときだけ `"B"`。それ以外は `"A"`。
- `generateNarrative` で使う版は、`options.promptVariant ?? selectProductionPromptVariant({...})` で決める。`hasEvents` は `options.assembled.match_events.length > 0`。
  - `promptVariant` を明示した場合（試し焼き）は、今までどおりその版を使う。
- **本番の既定を A に戻すときは、この関数だけを変えれば済むようにする**（切り戻しを 1 か所にするため）。

### 2. `generateMatchContent`（`lib/llm/pipeline.ts:244`）

- `const promptVariant = options.promptVariant ?? "A";` をやめ、`options.promptVariant` をそのまま `generateNarrative` に渡す（未指定なら `undefined`）。
- 英語で B を使えない検査（`:245`）は、`options.promptVariant === "B"` のとき（明示したとき）だけ行う。
- 試し焼きの記録（`PipelineTrialDetails.promptVariant`）には、実際に使った版を入れる。`generateNarrative` の戻り値に、使った版（`promptVariant: "A" | "B"`）を足して受け渡す。

### 3. 版番号

- `lib/llm/prompts/variant-b/generate-recap-b.ts` の `PROMPT_VERSION` を `recap-b@0.2.0` → `recap@5.0.0` にする。
  - 本番の保存（`match_content.prompt_version`）で、A の `recap@4.21.2` と区別できるようにする。構成が 5 節（または 4 節）から 3 節に変わるので、メジャー版を上げる。
- A の `recap@4.21.2`（`generate-recap.ts`）は、得点イベントが 0 件のレビューで引き続き使うので、変えない。
- プレビューの B（`preview-b@0.2.0`）は試し焼き専用のまま、変えない。
- A/B スクリプト（`scripts/ab-content-prompts.ts`）とそのテストが `recap-b@0.2.0` を前提にしている箇所は、`recap@5.0.0` に合わせる。

### 4. 変えないもの

- 字数不足の加筆（`reviseNarrativeLength`）: B2 の本文にもそのまま使う。加筆の指示は「見出し構成を維持」なので、B2 の 3 節も保たれる。
- 人名違反のフィードバック: B の経路でも今までどおり付く（`buildEntityViolationFeedbackBlock`）。
- 無料と有料の切り分け（`splitRecapForPaywall`）: 3 つ目の見出し（`# ターニングポイント`）から先が有料になる（Owner 決定、2026-09-24）。

## UI サーフェス

なし。レビューの見出しが 3 つになる（`# この試合の核心`、`# 試合全体像`、`# ターニングポイント`）。見出しに依存するコード（`lib/match-content/description.ts:32`、`lib/llm/stages/qa.ts` のターニングポイントの検査）は、この 3 つの見出しを含むので影響しない。

## LLM 連携

- 段 3（本文）のレビューだけが変わる。モデルは変えない。
- 費用: 1 本あたりの本文生成は A と同程度（B2 の試し焼きで本文＋検査が $0.064〜0.066）。

## 注意（QA との関係）

QA には「供給されたカード情報について、本文がカードと該当局面の因果に触れていなければ密度を下げる」という指示がある（`lib/llm/prompts/qa-content.ts:326`）。B2 は「カードがあっても失点の原因とは限らない。時系列と因果を区別する」と書かせる。試し焼き（カード 2 枚のヴァンヌ 対 トゥールーズ）では B2 は QA に合格した（密度 4）が、作り直しが増えた場合はこの指示の食い違いを疑う。この spec では QA を変えない。

## 受け入れ条件

1. `selectProductionPromptVariant` のテスト: 日本語レビュー・得点イベントあり → `"B"`、得点イベント 0 件 → `"A"`、プレビュー → `"A"`、英語レビュー → `"A"`。
2. `generateNarrative` を `promptVariant` なしで呼んだとき:
   - 日本語レビュー・得点イベントありでは、B2 の結合プロンプトが使われ、`promptVersion` が `recap@5.0.0` になる。
   - 日本語レビュー・得点イベント 0 件では、A の結合プロンプトと `recap@4.21.2` になる。
   - 日本語プレビューでは、A の結合プロンプトと `preview@3.15.3` になる。
   - 確認方法: `selectProductionPromptVariant` が常に `"A"` を返すようにすると、1 つ目のテストが落ちること。
3. `promptVariant: "A"` を明示すれば、日本語レビュー・得点イベントありでも A が使われる（試し焼きで A を選べることを保つ）。
4. `generateMatchContent` を `persist: true`（本番）で、試し焼きのオプションなしで呼んでも例外にならない（今までどおり）。英語のレビューでも例外にならない。
5. `buildJapaneseNarrativePrompt` の既定（第 2 引数なしは A）は変えない。A のプロンプトのスナップショットのテスト（`tests/llm/content-prompt-a-baseline.test.ts`）が差分なしで通る。
6. `pnpm lint`、`pnpm typecheck`、`pnpm test` が通る。**3 つとも実行して、結果を完了報告に含める。**

## マージ後の確認（Claude Code が行う）

7. デプロイ後の最初の数本の日本語レビューについて、`match_content.prompt_version` が `recap@5.0.0` で、見出しが 3 つであることを確かめる。
8. 1 週間後、`recap@5.0.0` のレビューの QA の判定（公開／作り直し／下書き）の割合と、有料部分が本文に占める割合を集計し、直前 30 日の A のレビュー（作り直し 35%）と比べて Owner に報告する。1 本ずつの事実照合はしない。

## 切り戻し

`selectProductionPromptVariant` が常に `"A"` を返すように変えてデプロイすれば、A に戻る。すでに B2 で作られた記事はそのまま残る。

## 未解決の質問

なし。
