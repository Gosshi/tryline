# verify-entities: チーム名・大会名を人名として誤検出する false positive を決定的に除外する

> 関連: `specs/feat-entity-grounding-gate.md`（PR #467）／`specs/fix-verify-entities-sourced-facts-grounding.md`（PR #472）／設計文書 `docs/design-content-grounding-architecture-2026-07-04.md`

## 背景

エンティティ照合ゲートの verifier（`gpt-4o-mini`）は、プロンプトで「チーム名・大会名・スタジアム名は対象外。人名だけを抽出する」と指示しているにもかかわらず、チーム名・大会名を人名として抽出し violation 判定してしまうことがある。**本番実測で2系統の実害を確認済み（2026-07-04〜05）**:

1. **ライブ生成での retry 浪費**: 日本vsイタリア preview の生成ループ（`pipeline_runs` 2026-07-04 10:43:54 UTC の stage 4）で、`ungroundedSurfaces = ["日本","イタリア","フランス","アイルランド"]` が返り、`factual_grounding=1` の hard block → 本来不要な retry を1回消費した（フランス・アイルランドは recent_form の対戦相手として本文に登場したチーム名）
2. **全件監査の精度汚染**: `tools/audit-entity-grounding.ts` の全件監査（2026-07-04、901件・違反209件）で、`allowedEntityCount=0` の違反8件中7件がチーム名・大会名（Munster / Leinster / Sharks / URC / フィジー / ウェールズ / カナダ等）の誤検出だった。「allowedEntityCount=0 ＝ほぼ確実に本物の捏造」という監査の層別ルールがこのバグで成立しなくなっている

プロンプト指示（テキスト遵守）に依存する限り再発するため、設計文書の原則「LLM は分類器、判定はコード」に従い、**コード側の決定的フィルタ**で除外する。

## スコープ

対象:
- `lib/content/allowed-entities.ts`: 既知の非人名（チーム名・大会名）集合を assembled から構築する関数を追加（例: `buildKnownNonPersonNames(assembled): string[]`。関数名は Codex 判断でよい）
- `lib/llm/stages/verify-entities.ts`: `verifyNarrativeEntities` に非人名集合を渡すオプションを追加し、`parseEntityVerificationResponse` の `ungroundedSurfaces` 算出時に「正規化した surface **または** matched_entity が非人名集合に一致する mention」を violation から除外する
- `lib/llm/pipeline.ts`: `runQualityGate` から非人名集合を渡す
- `tools/audit-entity-grounding.ts`: 監査でも同じ集合を渡す（監査とライブで判定が食い違わないこと）
- 対応するテスト

対象外:
- verifier プロンプト自体の変更（「チーム名は対象外」の既存指示は維持。信頼ゼロの補助という位置づけのまま。プロンプト変更なしなら `PROMPT_VERSION` バンプも不要）
- スタジアム名・都市名の除外（本番実測での誤検出はチーム名・大会名のみ。venue はスコープ外とし、実害が観測されたら追加）
- 監査バックログ209件の再生成（別判断・棚上げ中）

## データモデル変更

なし。

## LLM 連携

- 新規 LLM 呼び出しなし（既存の照合呼び出し内での判定ロジック変更のみ）。**コスト影響: ゼロ**（むしろ不要 retry の削減でコスト減）

## 実装方針（提案）

非人名集合の収集元（すべて `AssembledContentInput` 内に既存）:
- `match.home_team` / `match.away_team` の `name`・`name_ja`・`english_name`
- `recent_form`（home/away 双方）の `home_team_name`・`away_team_name`
- `h2h_last_5` の `home_team_name`・`away_team_name`
- `competition_standings` のチーム名
- `match.competition` の `name`・`name_ja`・`season` および `japanese_name_glossary` の全エントリ（source / ja 両表記）

判定は既存 `normalizeName`（空白正規化＋小文字化）で正規化した完全一致。部分一致は使わない（「日本代表の山田」のような複合語を誤って除外しないため）。

**観測性の維持**: 除外した mention も `mentions` 配列には残す（ログで「何が抽出され、なぜ violation にならなかったか」を追えるようにする）。除外は `ungroundedSurfaces` の算出からのみ行う。

参考: 既存の許可リスト構築パターンは `buildAllowedPersonEntities`（同ファイル）、判定側の合流は `parseEntityVerificationResponse`（`lib/llm/stages/verify-entities.ts`）。

## 受け入れ条件

1. 本番実測ケースの再現フィクスチャ: verifier 応答が `[{surface:"日本",matched_entity:null},{surface:"イタリア",matched_entity:null},{surface:"フランス",matched_entity:null},{surface:"アイルランド",matched_entity:null}]` を返し、非人名集合にこれらが含まれるとき、`ungroundedSurfaces` が空になる
2. 非人名集合に含まれない実在人名（例: surface「アティソグベ」matched_entity null、許可リスト空）は引き続き `ungroundedSurfaces` に含まれる（ゲートを弱めない）
3. 監査ツール経由（`tools/audit-entity-grounding.ts`）でも同じ除外が適用される（Munster / URC 等のチーム名・大会名 surface が violation にならないユニットテスト）
4. 除外された mention が `mentions` 配列には残っていることを確認する（観測性）
5. 非人名集合が空（従来挙動）のとき、既存テストが全て壊れない（後方互換）
6. `pnpm test`・`pnpm tsc --noEmit` 通過

## 未解決の質問

- チーム名と人名が偶然一致するケース（例: 姓が地名・チーム名と同綴り）は理論上ゲートを弱める方向の誤除外になるが、ラグビーのチーム名（国名・都市名・フランチャイズ名）と選手姓の衝突は実用上稀であり、許容するリスクとして明記する。Codex は実装時に懸念があれば報告すること
