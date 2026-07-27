# Codex プロンプト: feat-web-weekly-news-page

**tryline リポジトリ**で貼る(仕様書: `specs/feat-web-weekly-news-page.md`)。既存の週間ニュース機構(PR #645〜#648、マージ・デプロイ済み)のデータをWebにも表示する新規ページです。

---

`specs/feat-web-weekly-news-page.md` の仕様を実装してください。既存の`weekly_news_items`データを、シンプルなクロール可能な一覧ページとしてWebに表示します。API・データモデルの変更は不要です。

コンテキスト:
- 既存のデータ取得関数: `lib/db/queries/weekly-news.ts`の`getPublishedWeeklyNewsItems(weekFrom, weekTo)`
- 週の算出: `lib/format/week.ts`の`getCurrentJstWeekRangeUtc`
- 参考実装(Server Componentが`lib/db/queries/*`を直接呼ぶパターン): `app/page.tsx`
- `AGENTS.md`を読む

やること:
1. 新規ページ`app/news/page.tsx`を作成し、当該週の`status='published'`な項目を一覧表示する(`getPublishedWeeklyNewsItems`を直接呼び出す。新規APIエンドポイントは作らない)
2. `generateMetadata`で静的なタイトル・説明文を設定する(DBクエリに依存させない)
3. `app/sitemap.ts`に`/news`を追加する
4. セマンティックHTML(`main`・`h1`・`article`等)で一覧を構成する。各項目に出典ドメインへの外部リンク(`target="_blank" rel="noopener"`)を含める

エッジケース:
- 0件の場合は空状態メッセージを表示し、ページ自体は404にしない

やらないこと:
- 過去週のアーカイブ・ページネーション
- ホームページへのティーザーセクション追加
- 新規APIエンドポイント・DBスキーマ変更
- モバイル版ストーリーUIのWeb移植

完了の定義:
- specs の受け入れ条件 1〜7 を満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容・変更ファイルを要約する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
