# Codex プロンプト: web sourced facts を DB 権威データと整合させる

仕様: specs/fix-sourced-facts-db-authoritative-scope.md を参照（内容はインライン展開しない）。

## タスク
web 検索由来の sourced facts が、DB が権威を持つ対戦成績・スコアを取りに行き、古い結果を "most recent" と誤ラベルして注入する不具合を修正する（実例: 決勝 preview がDBと矛盾する「前回クボタ勝利→クボタ優位」で生成された）。検索意図を off-DB 情報に限定し、取得後に結果スコア・相対 recency 主張を完全除外する。

## 変更ファイルと内容

### 1) lib/llm/sourced-facts/fetch.ts — buildSearchPrompt
- 検索意図(L136-144)から "head-to-head" と "recent form" を削除する。
- 残す: latest team news / injuries / lineup changes / 引退・移籍など選手ニュース / knockout・final の文脈。
- Rules(L146-154)に追記:
  - "Do not return past result scores, league standings, or win/loss records (the database is authoritative for these)."
  - "When referencing any past match, include the exact date. Never use relative recency phrasing such as 'most recent', 'previous meeting', or 'last time they met'."

### 2) lib/llm/sourced-facts/allowlist.ts
ドメイン許可に加え、内容ベースの除外を追加（filterAllowedSourcedFacts 拡張 or 新規 rejectDbAuthoritativeFacts）。除外＝完全に捨てる（降格保存しない）:
- スコアパターン（1〜3桁 - 1〜3桁、ハイフンと en-dash 双方）を含む fact を除外
- "most recent" / "latest encounter" / "previous meeting" / "last time they met" 等の相対 recency 表現（大文字小文字無視）を含む fact を除外
- 除外時は理由を記録（skippedReason か metadata）

既存の confidence 解決・許可ドメイン判定は維持。

## 受け入れ条件（完了の定義）
- buildSearchPrompt 出力に "head-to-head" / "recent form" が含まれない
- 内容フィルタ単体テスト:
  - "...defeated... 33-28..." → 除外
  - "most recent encounter..." → 除外
  - "Player X is out with a hamstring injury" → 通過
  - "Kobe lineup features Retallick, Savea" → 通過
- 既存テスト（tests/llm/sourced-facts.test.ts, tests/api/fetch-sourced-facts.test.ts）が緑
- pnpm tsc --noEmit / pnpm lint clean

## エッジケース
- スコア表記の en-dash と hyphen 双方を検出する
- fact が空文字 → 除外（既存挙動と整合）
