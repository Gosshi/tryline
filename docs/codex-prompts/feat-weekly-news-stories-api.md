# Codex プロンプト: feat-weekly-news-stories-api

**tryline リポジトリ**で貼る(仕様書: `specs/feat-weekly-news-stories-api.md`)。モバイルUI(`feat-mobile-weekly-news-stories.md`)の前提となるため、こちらを先に実装・デプロイする。

---

`specs/feat-weekly-news-stories-api.md` の仕様を実装してください。試合に紐付かない「今週のニュース」項目を、週単位のWeb検索で取得しDBに保存、`GET /api/v1/stories/weekly-news`で配信する新機能です。

コンテキスト:
- 参考実装: `lib/llm/sourced-facts/fetch.ts`(`buildSearchPrompt`のプロンプトルール・`createWebSearchJsonResponse`の使い方)、`lib/llm/sourced-facts/allowlist.ts`(`isAllowedSourcedFactDomain`)、`lib/api/v1/stories.ts`・`app/api/v1/stories/route.ts`(既存stories APIの構造)、`app/api/og/route.tsx`(既存OG生成パターン)
- `AGENTS.md`を読む
- 新規マイグレーションが必要(`weekly_news_items`テーブル)。マイグレーションファイルの追加のみ行い、**本番DBへの適用はOwnerが別途行う**(このリポジトリの運用ルール)

やること:
1. マイグレーション追加: specの「データモデル変更」のDDLに沿って`weekly_news_items`テーブルを作成
2. `lib/llm/weekly-news/fetch.ts`: 週単位でWeb検索を実行し(1〜3回程度)、`weekly_news_items`に`status='draft'`で保存する関数を実装。プロンプトは`buildSearchPrompt`の著作権ルール(15語超引用禁止・記事転載禁止・言い換え必須・出典URL必須)を踏襲し、search intentを「今週の移籍・コメント・大会関連ニュース」に変更する
3. 出典ドメインを`isAllowedSourcedFactDomain`でフィルタ(新規ドメインリストは作らない)
4. `lib/api/v1/types.ts`に`V1WeeklyNewsItemCategory`・`V1WeeklyNewsItem`・`V1WeeklyNewsData`を追加(spec記載のとおり。既存`V1StoryItem`は変更しない)
5. `app/api/v1/stories/weekly-news/route.ts`(新規): 当該週の`status='published'`項目のみ返す
6. `app/api/og/route.tsx`に`type=weekly-news`対応を追加(カテゴリ別トーン背景、スコア非表示)
7. 手動実行用のCLIスクリプトまたはroute handler(cron定義ファイルは追加しない。spec対象外)

エッジケース:
- Web検索結果が0件、または全件が許可ドメイン外だった場合はエラーにせず0件保存で正常終了する
- `category`にLLMが未知の値を返した場合は`other`扱いにする
- `GET /api/v1/stories/weekly-news`は0件でも200・空配列を返す(404にしない)
- `GET /api/og?type=weekly-news`で`category`が不正値の場合は`other`のトーンにフォールバックする

やらないこと:
- cronワークフローファイルの追加(`.github/workflows/`は触らない)
- `status`を`draft`→`published`にするための管理UI(v1はSQLまたは簡易スクリプトのみ)
- 既存の`match_sourced_facts`・`V1StoryItem`・`V1StoriesData`・既存stories APIの変更
- 本番DBへのマイグレーション適用・cron有効化

完了の定義:
- specs の受け入れ条件 1〜8 を満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容・変更ファイルを要約する
- 週1〜3回のWeb検索呼び出しについて、実行できる場合は実際の$コスト目安を報告する(spec未解決の質問1)
- `status`を`published`にする運用フローの実装判断を報告する(spec未解決の質問2)
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
