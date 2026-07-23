# Codex プロンプト: feat-mobile-match-detail-related-news (API段階)

**tryline リポジトリ**で貼る(仕様書: `specs/feat-mobile-match-detail-related-news.md`)。この後に続くUI段階(`tryline-mobile`向け)より**先に**実装・マージすること。

---

`specs/feat-mobile-match-detail-related-news.md` の「API サーフェス(tryline)」節を実装してください。試合詳細APIに関連ニュース(出典リンク付き)を追加する変更です。

コンテキスト:
- 対象: `app/api/v1/matches/[id]/route.ts`、`lib/api/v1/types.ts`の`V1MatchDetail`
- 参考実装: `app/api/v1/stories/route.ts`の`buildNewsItems()`関数(pre/postフェーズ、`MAX_NEWS_ITEMS_PER_MATCH`定数、`sourced_facts`からの重複排除ロジック)を1試合分に適用する

やること:
- `V1MatchDetail`に`related_news: V1StoryItem[]`を追加
- `matches/[id]/route.ts`で対象試合の`sourced_facts`を取得し、`buildNewsItems()`相当のロジック(pre+post両方)を適用して`related_news`を組み立てる
- 重複コードを避けるため、`buildNewsItems()`をstories routeから共通モジュールへ抽出することを推奨(例: `lib/api/v1/stories.ts`)。抽出が難しければ重複実装でも可(ただしコメントで重複箇所を明記)

エッジケース:
- news itemが存在しない試合は`related_news: []`(nullでなく空配列)
- 対象試合以外のnews itemが混入しないこと(`getStorySourcedFactsForMatches`は複数試合対応の関数なので、呼び出し時に対象試合IDのみ渡すか、結果をフィルタする)

完了の定義:
- specs の受け入れ条件 1〜2(tryline側)を満たすテストを追加
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容・変更ファイルを要約する
- `buildNewsItems()`共通化の方針とその理由を報告する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
