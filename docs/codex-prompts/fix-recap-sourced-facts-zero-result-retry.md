`/specs/fix-recap-sourced-facts-zero-result-retry.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- `lib/llm/sourced-facts/fetch.ts` の `fetchSourcedFactsForMatch()` は、recap生成用に `createWebSearchJsonResponse` で1回だけWeb検索を行っている。検索意図・許可ドメインは既に十分だが(過去specで実装済み)、LLMのWeb検索1回の結果は非決定的で、本番調査では直近15件のrecapのうち6件(40%)がsourced_facts 0件だった
- 実際に同じ試合を手動で検索すると容易に関連記事が見つかったケースがあり、単純な再試行で改善が見込める

やること:
- `fetchSourcedFactsForMatch()` 内で、`options.contentType === "recap"` かつ検索結果(`filterAllowedSourcedFacts` 後)が0件だった場合に限り、同じプロンプトで `createWebSearchJsonResponse` をもう1回呼ぶ
- 2回目も0件なら、そのまま空配列の結果を返す(3回目は呼ばない)
- `contentType === "preview"` の場合はリトライしない(既存の1回のみの挙動を維持)

処理すべきエッジケース:
- 1回目が0件、2回目が非空の場合、2回目の結果を正しく保存・返却する
- 1回目が既に非空の場合、2回目は呼ばれない(無駄なコストを発生させない)
- リトライによる追加コストは、recapのsourced facts取得が試合単位でキャッシュされる既存の仕組み(`shouldUseCachedFacts`)の範囲内であることを確認する(リトライ自体がキャッシュを無効化したり、キャッシュの仕組みを壊したりしないこと)

完了の定義:
- specs の受け入れ条件1〜4を満たす
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` clean
- 変更ファイル一覧を報告する(想定: `lib/llm/sourced-facts/fetch.ts`、関連テスト)

要件:
- 「対象外」(`buildSearchPrompt`の検索意図追加、許可ドメインリストの追加、previewへのリトライ追加)は実装しない
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
