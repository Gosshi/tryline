`/specs/feat-news-item-english-fact-translation.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- news item(ストーリー機能の一種)は現状 `content_type in ('preview','shared')` かつ `confidence='high'` かつ日本語判定(ひらがな/カタカナ含有)の sourced_facts のみを対象にしている(`app/api/v1/stories/route.ts` の `JAPANESE_CHARACTER_PATTERN` フィルタ、35-36行目・230-280行目付近)。本番データ実測で、この対象は21件中19件が既に日本語で翻訳の効果が薄い一方、`confidence=medium` の preview facts は英語23件・日本語4件と英語が大多数を占め、丸ごと未活用になっている
- `lib/llm/sourced-facts/fetch.ts` の `buildSearchPrompt`(96-157行目)が web search 用プロンプトを組み立て、`fetchSourcedFactsForMatch`(296行目付近)が結果を `match_sourced_facts` に保存する
- `lib/db/queries/sourced-facts.ts` の `getStorySourcedFactsForMatches` が news item 用に sourced_facts を取得する

やること:
1. `match_sourced_facts` に `fact_ja text null` カラムを追加するマイグレーションを作成する(`supabase/migrations/` の既存命名規則に従う)
2. `buildSearchPrompt` の **preview分岐のみ**(`contentType !== "recap"` の側)に、fact ごとに `fact_ja`(自然な日本語ニュース文体の言い換え、80〜160字目安)を同じJSONレスポンスで返す指示を追加する。recap分岐は変更しない
3. `fetchSourcedFactsForMatch` / レスポンスパース処理(`parseSourcedFactsResponse` 等)が `fact_ja` を読み取り、`match_sourced_facts.fact_ja` に保存するようにする。`fact_ja` が欠落・空文字の場合は `null` として保存する(エラーにしない)
4. `getStorySourcedFactsForMatches`(`lib/db/queries/sourced-facts.ts`)の select に `fact_ja` を追加し、`StorySourcedFact` 型に `factJa: string | null` を追加する
5. `app/api/v1/stories/route.ts` の news item 選定ロジックを変更する:
   - confidence フィルタを `'high'` のみから `in ('high','medium')` に拡張
   - 採用条件を「`JAPANESE_CHARACTER_PATTERN.test(fact)` が true」**または**「`factJa` が非null かつ非空文字」に拡張
   - summary生成時、`factJa ?? fact` をテキストソースとして使う(`truncateAtSentenceBoundary` は変更しない)

処理すべきエッジケース:
- `fact_ja` が既存(このPR以前)の行では全て `null`。既存行は従来どおり「元のfactが日本語か」でのみ判定され、除外されない(非破壊)
- `confidence='low'` の fact は `factJa` の有無に関わらず引き続き news item から除外される
- `content_type in ('preview','shared')` 限定・kickoff前ゲート(`fetched_at < kickoff_at`)は変更しない
- recap用の検索呼び出しには `fact_ja` 指示を追加しない(コスト増を避けるため。recap facts は news item に使われない)

完了の定義:
- specs の受け入れ条件1〜6を満たす(7はOwnerが本番データで確認するためスコープ外)
- **マイグレーションファイルを作成すること。ただし本番Supabaseへの適用はOwnerが行う。このマイグレーションが適用されるまでは本PRをマージしないよう、変更ファイル一覧の報告時に明記すること**(このリポジトリでは過去3回、マイグレーション未適用のままコードがデプロイされ本番障害になった前例がある)
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` clean
- 変更ファイル一覧を報告する(想定: `supabase/migrations/<timestamp>_add_match_sourced_facts_fact_ja.sql`、`lib/llm/sourced-facts/fetch.ts`、`lib/db/queries/sourced-facts.ts`、`app/api/v1/stories/route.ts`、関連テスト)

要件:
- 「対象外」(recap用プロンプトへのfact_ja追加、confidence=low の許容、既存factへの遡及バックフィル、掲載件数上限やドメイン重複排除ロジックの変更)は実装しない
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- **マイグレーション適用が必要である旨を明示的に報告する**(見落とし厳禁)
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
