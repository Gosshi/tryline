# web sourced facts を DB 権威データと整合させる

## 背景

2026-06-06 のリーグワン決勝 preview（match `0fd7d8e6-37f9-4b58-82dd-9c2d5592fd64`, ja）再生成で、本文が「**前回の対戦でクボタが勝利したためクボタが心理的に優位**」という誤った主旨で生成された。

根因は `match_sourced_facts` に保存された web 検索由来の事実:

> "In their **most recent encounter on December 13, 2025**, Kubota Spears defeated Kobelco Kobe 33-28…" （confidence: **high**）

しかし DB の実データでは、両者の直近対戦は **2026-05-10（クボタ 19–24 神戸＝神戸勝利）**であり、12月戦は「直近」ではない。web 検索が古い結果を "most recent" と誤ラベルし、それが high confidence で注入されたため、ナラティブが誤前提で構築された。QA は「sourced fact に存在する」ため factual_grounding=5 を付与し、検出できなかった。

構造的な問題は2点:

1. **検索意図が DB 権威領域と重複している**。`buildSearchPrompt`（`lib/llm/sourced-facts/fetch.ts` L136-144）は "head-to-head" と "recent form" を web に問い合わせている。だが対戦成績・スコア・順位・直近成績は **DB が権威**を持つ（設計不変条件「数値はDB実データのみ」）。web から取った結果スコアは DB と矛盾・陳腐化しうる。
2. **取得後の整合チェックが無い**。DB の最新試合と矛盾する recency 主張（"most recent" / "previous meeting" / "last time"）や、スコアを含む結果系 fact がそのまま保存・利用される。

本 spec は `feat-web-sourced-facts.md`（機能本体）への後続の正確性 fix。`fix-web-search-json-mode.md`（JSON モード）・`fix-qa-factual-grounding.md`（QA 側）とは別領域。

## スコープ

対象:
- `lib/llm/sourced-facts/fetch.ts` の `buildSearchPrompt` の検索意図を、**DB が持たない off-DB コンテキスト**に限定する
- 取得後の検証で、結果スコア・順位・recency 主張を含む fact を除外（またはドロップ）する
- `lib/llm/sourced-facts/allowlist.ts` の `filterAllowedSourcedFacts` に、ドメイン許可リストに加えて「内容」での除外フィルタを追加

対象外:
- ナラティブ/QA プロンプト本体の変更（sourced_facts が綺麗になれば波及して改善する）
- 既存の許可ドメインリスト方針の変更
- DB の H2H / form データ自体の生成（既存機能）

## データモデル変更

なし（`match_sourced_facts` スキーマ据え置き）。

## API サーフェス

なし（内部パイプラインのみ）。`/api/cron/fetch-sourced-facts` の I/O 形状は不変。

## UI サーフェス

なし。

## LLM 連携

パイプライン段階: fetch-sourced-facts（ナラティブ生成の前段）。

実装方針:

1. **検索意図の再スコープ**（`buildSearchPrompt`）:
   - 残す（DBに無い情報）: latest team news / injuries / lineup changes / 引退・移籍などの選手ニュース / knockout・final の文脈・物語性
   - 外す（DB権威）: "head-to-head"、"recent form"（結果スコア・順位・勝敗記録）
   - ルールに明記: 「過去の結果スコア・順位・勝率は返さない（DB が権威）。試合結果に言及する場合は必ず正確な日付を併記し、"most recent" / "previous meeting" / "last time" など相対的な直近表現は使わない」

2. **取得後の内容フィルタ**（`filterAllowedSourcedFacts` 拡張 or 新規 `rejectDbAuthoritativeFacts`）:
   - スコアパターン（例 `\b\d{1,3}\s*[-–]\s*\d{1,3}\b`）を含む fact を除外
   - "most recent" / "latest encounter" / "previous meeting" / "last time they met" 等の相対 recency 表現を含む fact を除外
   - 除外理由を `metadata` か `skippedReason` に記録（観測可能性）

3. 既存の許可ドメイン・confidence ルールは維持。

## 受け入れ条件

- `buildSearchPrompt` の出力に "head-to-head" / "recent form" の語が含まれない（スナップショット or 文字列アサート）
- 内容フィルタの単体テスト:
  - "...defeated... 33-28..." を含む fact → 除外
  - "most recent encounter..." を含む fact → 除外
  - "Player X is out with a hamstring injury"（負傷・スコア無し）→ 通過
  - "Kobe lineup features Retallick, Savea"（選手名・スコア無し）→ 通過
- 決勝の再フェッチで、12月戦スコアや "most recent" 系 fact が保存されないことを確認
- 既存テスト（`tests/llm/sourced-facts.test.ts`, `tests/api/fetch-sourced-facts.test.ts`）が緑
- `tsc --noEmit` clean / `eslint` clean

## 決定事項

- 結果スコア・順位・recency 主張を含む fact は **完全除外**する（降格保存しない）。DB が権威であり、ナラティブはスコア・順位・H2H を DB から得るため、これらを web fact として残す利点がない。
- 決勝 preview の即時是正は本 spec とは別の運用対応（誤 fact 行の削除＋再生成）で先行実施済み（2026-06-06）。
