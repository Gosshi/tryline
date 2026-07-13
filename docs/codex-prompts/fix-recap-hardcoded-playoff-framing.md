# Codex プロンプト: recap生成プロンプトの「プレーオフ」固定文言バグ修正

仕様書: `specs/fix-recap-hardcoded-playoff-framing.md`（権威）。本プロンプトは要点と着手手順のみ。内容は仕様書を参照すること。

## バグ

`lib/llm/prompts/generate-recap.ts` L94 の以下の行が、`match_phase` の値に関わらず常にプロンプトへ注入されている:

```
"- プレーオフという文脈と一発勝負の重み（80字程度）",
```

このため、`hasEvents && !hasLineups` 分岐（confirmed lineupsが無い試合で使われる、L81-114）を通る試合は、実際は `match_phase="league"`（通常のリーグ戦・プールステージ）であっても recap 本文が「プレーオフ」「一発勝負」と誤って生成される。`deriveMatchPhase()`（`lib/llm/stages/assemble.ts` L302-341）と `matchPhaseBlock`（`generate-recap.ts` L219-261）はどちらも正しく動作しており、修正対象はL94の固定文言のみ。

## 完了の定義

仕様書「受け入れ条件」1〜5をすべて満たす。`pnpm test` / `pnpm tsc --noEmit` green。

**重要**: このタスクのスコープは**コード修正とテストのみ**。該当6試合recapの再生成は含まない（本番LLM呼び出しのため、コスト承認込みでOwner/Claude Codeが別途実施する）。

## 着手手順（推奨順）

1. `lib/llm/prompts/generate-recap.ts` L94 を、`assembled.match_phase`（`MatchPhase | null`、`lib/llm/types.ts` L18-23）を参照する条件分岐に置き換える。仕様書「LLM連携」記載の方針(a)を推奨:
   - `match_phase` が `"playoff_final" | "playoff_other" | "playoff_third_place" | "playoff_semifinal"` のいずれか → 現行文言「プレーオフという文脈と一発勝負の重み（80字程度）」を維持
   - `match_phase` が `"league"` または `null` → 「大会内での位置づけ（大会名・シーズン・順位表への影響、分かる場合はラウンド名）（80字程度）」に差し替え
   - `isDataSparse` 分岐（L61-80）の「大会文脈と順位への影響」セクション（L73）の文言を参考に、既存の言い回しと整合させる
2. `generate-preview.ts` を目視確認し、同種の「match_phaseを無視したプレーオフ固定文言」が存在しないか調査する。存在すれば**修正はせず**、仕様書「未解決の質問2」に沿ってOwnerへ報告する一文を実装完了報告に含める。
3. `tests/llm/prompts/generate-recap.test.ts` に受け入れ条件1・2のテストケースを追加。既存フィクスチャ（L22 `match_phase: null` がデフォルト、L431/L446に `playoff_final`/`playoff_third_place` の既存ケースあり）のパターンに倣う。

## エッジケース

- `match_phase` が `"playoff_other"` 等の場合、既存の `matchPhaseBlock` が既に「試合全体像の冒頭に含めること」という別の指示を出している。L94差し替え後の文言と重複・矛盾しないか確認する（重複を許容するか、L94側では触れないようにするかは仕様書「未解決の質問1」の通りOwner確認事項だが、実装上は「試合全体像セクションの構成要素として何を書くか」という粒度の指示に留め、`matchPhaseBlock` の詳細指示と役割分担が壊れないようにする）。
- `hasLineups` 分岐（L41-60）・`isDataSparse` 分岐（L61-80）には該当のハードコード文言は存在しない想定だが、念のため目視で確認し、もし類似の固定文言があれば実装完了報告に記載する（このタスクでは修正しない）。

## 参考パターン

- `isDataSparse` 分岐（L61-80）内の「大会文脈と順位への影響」セクション記述（L66・L73）が、league相当の中立的な文脈指示の既存パターンとして参考になる。
- `matchPhaseBlock`（L219-261）の `phase` 分岐の書き方（switch的なif連鎖）をL94差し替えの実装スタイルとして踏襲してよい。

## 実装完了報告に含めること

- L94差し替えの実装方針（(a)採用の場合はその旨、別方針を取った場合は理由）
- `generate-preview.ts` の同種文言の有無の調査結果
- 変更ファイル一覧・テスト結果
