# Codex プロンプト: リーグワン プレーオフ stage ラベリング修正

仕様書: `specs/fix-league-one-playoff-stage-labeling.md`（権威）。本プロンプトは要点と着手手順のみ。内容は仕様書を参照すること。

## 完了の定義
仕様書「受け入れ条件」1〜5 をすべて満たす。`pnpm test` / `pnpm tsc --noEmit` green。

## 着手手順（推奨順）
1. **まず実 HTML を確認**（仕様書「未解決の質問1」）。`lib/ingestion/sources/league-one-live.ts` のスケジュール取得対象ページで、決勝カードと3位決定戦カードの `.ttl-wrap .ttl` 構造を確認し、**2試合を分けられるシグナル**を特定する。robots.txt 遵守・`fetchWithPolicy` 経由・レート制限厳守（仕様書/プロジェクト規約）。
2. **parser 修正**: `league-one-live.ts` で決勝→`"Final"`、3位決定戦→`"3rd place match"`（"final" を含まない値）を付与。`parsePlayoffStageName` または stage 割り当てロジックを修正。
3. **deriveMatchPhase 修正**: `lib/llm/stages/assemble.ts` L294-306。**3位決定戦判定を `includes("final")` の前に置く**（順序が肝）。`lib/llm/types.ts` の `MatchPhase` に新値追加。
4. **プロンプト修正**: `lib/llm/prompts/generate-preview.ts`(L62-84) と `generate-recap.ts`(L169-205) の `matchPhaseBlock` に新 phase 分岐。「決勝/チャンピオン/優勝/タイトル」を禁止する文言（仕様書 LLM 連携の例文）。
5. **backfill**: 当該2試合の round_name を正しい値に。parser 修正後の通常同期で直るならそれを使う（追加スクリプト不要が理想）。
6. **再生成**: `scripts/generate-match-preview.ts` で 3位決定戦（`96863688-cf14-40f8-b3d7-8d485ae5504b`）の preview を ja+en 再生成し、本文に「決勝」が出ないことを確認。recap も同様（recap は match_events 必要・パイプライン仕様参照）。

## エッジケース
- round_name が `"3rd place match/Final"` の**複合のまま残る**データが他シーズンにもある可能性 → deriveMatchPhase 側でも「3rd place を含むなら playoff_final にしない」防御を入れる（parser が直っても過去データを保護）。
- 決勝（`0fd7d8e6-...`）を**リグレッションさせない**: 引き続き playoff_final・「決勝戦」。
- 他リーグの "Final"（URC Grand Final 等）に影響を与えない（リーグワン限定の判定にするか、3位決定戦判定は文字列ベースで全リーグ共通でも安全か確認）。

## 参考パターン
- 既存の stage 判定: `lib/ingestion/sources/wikipedia-pnc.ts`(`Bronze_Final`)、`wikipedia-rwc-results.ts`(`bronze-final`) が3位決定戦相当を扱っている。命名・判定の参考に。
- fixture テスト: 既存スクレイパテスト（`tests/` 配下）の HTML fixture パターンに倣う。

## 現状の暫定対応（Codex 着手前提の状態）
- 3位決定戦（`96863688-...`）の preview は ja+en とも **draft 降格済み**（誤「決勝」表記を LIVE から除去済み）。修正・再生成・検証後に published へ戻す。
