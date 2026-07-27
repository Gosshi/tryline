# feat-web-weekly-news-page: Web版「今週のニュース」一覧ページ

対象リポジトリ: **tryline**のみ。既存の`feat-weekly-news-stories-api.md`(PR #645〜#648、マージ・デプロイ済み)のデータをWeb面にも表示する。API・データモデルの変更は不要。

## 背景

モバイル側にはInstagram風ストーリー形式で「今週のニュース」を実装済み(`tryline-mobile` PR #51)。Owner・Claude Codeで検討した結果、この形式(スワイプ式全画面オーバーレイ)をそのままWebに移植するのは以下の理由で見送ることにした:

- Trylineの現在のグロース課題はSEO(検索流入)であり、ストーリー形式はクロール・インデックスされにくく、この課題とは逆方向の投資になる
- モバイル側のジェスチャー・pause管理をWeb(Next.js)向けにゼロから作り直すコストに対し、現状のデータ量(週0〜2件)はまだ薄い

代わりに、同じデータ(`weekly_news_items`)を**シンプルな一覧ページ**として表示する。クロール可能・インデックス可能な通常のHTMLページにすることで、SEOへの貢献も期待できる。

## スコープ

対象:
1. 新規ページ`app/news/page.tsx`: 当該週の`status='published'`な`weekly_news_items`を一覧表示する
2. データ取得は既存の`lib/db/queries/weekly-news.ts`の`getPublishedWeeklyNewsItems`をServer Componentから直接呼び出す(ホームページ`app/page.tsx`が`lib/db/queries/*`を直接呼ぶ既存パターンに倣う。新規APIエンドポイントは作らない)
3. `app/sitemap.ts`に`/news`を追加する
4. 静的な`generateMetadata`(タイトル・説明文)を設定する。**DBクエリに依存する動的メタデータにはしない**(既存ページで`generateMetadata`に新規DBクエリを追加してテストが壊れた前例があるため、今回は固定文言に留める)

対象外:
- 過去週のアーカイブ・ページネーション(現状のクエリ・APIは当該週のみ対応。将来的に必要になれば別spec)
- ホームページへのティーザーセクション追加(データ量が十分増えてから検討する)
- モバイル版のストーリーUIをWebに移植すること
- 新規APIエンドポイント・DBスキーマ変更

## データモデル変更

なし。

## API サーフェス

なし(既存の`getPublishedWeeklyNewsItems`をServer Component内で直接呼び出す)。

## UI サーフェス

- ルート: `/news`
- 構成: `<main>` > `<h1>今週のニュース</h1>`(対象週のラベル併記) > `<article>`のリスト(各項目: カテゴリラベル・見出し・要約・出典ドメインへのリンク`<a href={source_url} target="_blank" rel="noopener">`・公開日)
- 0件の場合: 「今週のニュースはまだありません」等の空状態メッセージを表示する(モバイル版と異なり、ページ自体は非表示にしない。URLとして存在し続けることがSEO上望ましいため)
- 見出しタグ・リンクなど、セマンティックHTMLを用いる(`div`スタックを避ける)

## LLM 連携

なし(既存の`weekly_news_items`データをそのまま表示するのみ)。

## 受け入れ条件

1. `/news`にアクセスすると、当該週の`status='published'`な項目が一覧表示される(`draft`は表示されない)
2. 0件の場合、空状態メッセージが表示され、ページ自体は404にならない
3. 各項目に出典ドメインへの外部リンクがあり、`target="_blank" rel="noopener"`が設定されている
4. `app/sitemap.ts`に`/news`が含まれる
5. `generateMetadata`は静的な文言を返し、新規DBクエリに依存しない(既存の`generateMetadata`関連テストへの影響がないことを確認する)
6. セマンティックHTML(`main`・`h1`・`article`等)を用いている
7. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る

## 未解決の質問

- ホームページへのリンク導線(「今週のニュース」への遷移リンクをどこに置くか)は今回のスコープ外。データ量が増えた段階でOwnerが判断する
- 過去週のアーカイブ機能の要否は、しばらく運用してデータが溜まってからOwnerが判断する
