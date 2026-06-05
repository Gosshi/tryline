# 捏造を字数より優先してブロックする（#374 の緊急是正）

> 作成: 2026-06-05 / 起票: Track B 検証で発覚 → Track A 緊急
> 関連: `specs/fix-ja-content-length-enforcement.md`（#374・本specはその是正）／`specs/fix-content-fabrication.md`（捏造対策の本流）

## 背景（重大）

#374（ja 字数下限の QA 強制＋加筆リトライ）をマージ後、決勝 ja プレビューを再生成して検証したところ、**字数を稼ぐためにモデルが統計を捏造**し、**`factual_grounding: 1` のまま publish された**。

実測（2026-06-05、決勝 `0fd7d8e6` ja preview 再生成）:
- QA: `information_density:2, factual_grounding:1, japanese_quality:4, tactical_depth:4`
- issues: 「本文が目標字数の下限未満です」「**データに存在しない統計値を含む**」「字数下限未達のまま加筆リトライ上限に到達しました」
- verdict: **publish**（＝捏造を含む本文が公開された）
- 本文の捏造例: 「クボタ…**リコー戦での52-8の勝利**」（実在しない試合/スコア。クボタの実績は QF 東芝26-3・SF 24-26）。

→ **元の「薄いが正確（1,045字・factual 4）」より明確に悪化**。しかも決勝は X 送客先で、現在 live に捏造が載っている。

## 根本原因

`fix-ja-content-length-enforcement`（#374）の優先順位が**逆**：
- 現状＝「**長さ ＞ 正確さ**」：字数下限を満たすため加筆リトライ → モデルが統計を捏造 → factual_grounding が落ちても publish。
- あるべき＝「**正確さ ＞ 長さ**」：捏造するくらいなら**短く正確**に。

QA は `factual_grounding:1` と「データに存在しない統計値を含む」を**正しく検出している**のに、verdict が publish になっている（字数 issue と同様、検出しても止めない）。

## スコープ

対象:
- `lib/llm/stages/qa.ts`（verdict 決定ロジック）
- `lib/llm/pipeline.ts`（加筆リトライの採否ロジック）
- 必要なら `lib/llm/content-length.ts`（優先順位の定義）

対象外:
- 字数ゲート自体（#374）は残す。**優先順位だけ是正**。
- 実名活用（feat-lineup-aware-previews）。

## 仕様（中核）

1. **factual_grounding フロアを hard block に**：
   - `factual_grounding` が閾値未満（例: ≤2）、または「データに存在しない統計値を含む」issue がある場合は、**publish させない**（字数充足の有無に関わらず）。これは字数フロア（soft・warning publish）より**上位**。
2. **加筆リトライは factual を下げてはならない**：
   - 字数リトライ後の本文が、**リトライ前より factual_grounding が低下**（=加筆が捏造を招いた）した場合、**リトライ結果を破棄し、元の短く正確な版を採用**する。
   - 結果として「短いが正確」を publish（字数 warning は残してよい）。**捏造して長い** より **正確で短い** を常に優先。
3. **優先順位の明文化**：捏造ブロック ＞ 字数フロア。両立できない時は正確さを取る。

## 受け入れ条件（検証可能）

1. 決勝 `0fd7d8e6` ja preview を再生成すると、**捏造統計が含まれない**（factual_grounding ≥ 3、「データに存在しない統計値」issue 無し）。短くても可。
2. 「リコー戦52-8」等の**実在しないスコア/試合が本文に出ない**。
3. factual_grounding 低（捏造検出）の本文は **publish されない**（revise/別処理）。
4. 字数リトライで factual が下がるケースでは**元版（正確）が採用**される。
5. 既に正確で字数も足りるケース（例: 3決 1,534字 factual4）は**回帰しない**。
6. en は回帰しない。
7. `npm run typecheck`/`lint`/既存テスト green。捏造優先ブロック・リトライ破棄の単体テスト追加。

## 検証手順
1. 決勝 ja preview を再生成 → factual_grounding ≥3・捏造 issue 無しを確認。
2. 本文に「52-8」等の捏造スコアが無いことを目視＋DB確認。
3. 3決（既に factual4・1,534字）が変わらず publish されることを確認。

## 運用メモ（Track B・patch まで）
- **patch 完了まで、決勝 ja プレビューへの新規送客は控える**（現 live に捏造あり）。
- patch 後に決勝・3決を再生成し、捏造ゼロ＋できれば字数充足を再検算。

## 未解決の質問
1. factual_grounding の block 閾値（≤2 で良いか）。
2. 捏造検出時は revise リトライするか、即「短く正確な前段出力」に確定するか（コストと品質のバランス）。
