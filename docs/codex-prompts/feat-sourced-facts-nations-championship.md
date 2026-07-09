`/specs/feat-sourced-facts-nations-championship.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- `sourced_facts` の仕組み全体は `lib/llm/sourced-facts/fetch.ts`（Web検索・キャッシュ・保存）と `lib/llm/sourced-facts/allowlist.ts`（ドメイン許可リスト・事実フィルタ）を読んで理解すること
- 現状 `isSourcedFactsEnabledForMatch()`（`fetch.ts:76`）は `league-one` とノックアウトラウンドのみを対象にしている。これに `nations-championship` を追加する
- `RELATIVE_RECENCY_PATTERN` によるリジェクト（`allowlist.ts` の `getDbAuthoritativeFactRejectionReason`）は、現状「前回対戦」的な表現を含む事実を無条件でリジェクトしている。これは「前回対戦のスコアをLLMが誤って書く」ことを防ぐためのガードだが、今回追加したい「スコアには現れないドラマ性のある文脈」も誤って巻き込んでしまう。spec の「実装詳細 3.」に記載した通り、`SCORE_PATTERN` を伴わない場合は許可するよう調整する

入出力の例:
- `isSourcedFactsEnabledForMatch({ competition: { family: "nations-championship", ... }, ... })` は `true` を返す（現状は `false`）
- `getDbAuthoritativeFactRejectionReason("In their most recent meeting, South Africa won 45-21")` → `"db_authoritative_score"`（変更後も引き続きリジェクト）
- `getDbAuthoritativeFactRejectionReason("In their most recent meeting, the Wallabies missed a match-winning penalty in the final minute")` → `null`（変更後は許可、現状は誤ってリジェクトされている）

処理すべきエッジケース:
- spec の「未解決の質問」にある境界ケース（曖昧な時期表現でスコアを含まない場合）の扱いに迷ったら、完了報告で質問として提示する。実装を進める前に判断に迷う場合は保守的（リジェクト側）に倒してよい
- プレビュー用検索意図の追加文言は、recap側の検索意図（`buildSearchPrompt` の `contentType === "recap"` 分岐）には影響させないこと

完了の定義:
- specs の受け入れ条件 1〜6 をすべて満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- 受け入れ条件2に記載した3つの具体例をそのままテストケースとして追加する
- 受け入れ条件3の実データ検証（実際のNations Championship試合1件でWeb検索を発火させ、`match_sourced_facts` に保存された内容を確認）を行い、保存された事実の実例を完了報告に含める

要件:
- スコープ対象外（他の国際大会への拡大、`match_sourced_facts` テーブルのスキーマ変更、許可ドメインリストへの新規追加、recap側検索意図の変更、シーズン全体への一括バックフィル）は実装しない
- 推測しない。境界ケースの判断に迷う場合は完了報告で質問として提示する

完了時:
- 実装内容、変更ファイルを要約する
- 受け入れ条件3で確認した実際の `match_sourced_facts` 保存内容（事実の文面・出典ドメイン）を報告する
- 仕様書からの逸脱があれば理由を明示する
