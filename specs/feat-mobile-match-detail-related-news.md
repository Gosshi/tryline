# feat-mobile-match-detail-related-news: 試合詳細への関連ニュース節追加

対象リポジトリ: **tryline(API) + tryline-mobile(UI)**。2段階(API→UI)で、Codexプロンプトも2本に分ける。

## 背景

2026-07-23のFable監査で、Trylineのプレビュー/レビュー記事(`ContentSection.tsx`)には出典リンクが一切ないことが指摘された(著作権の観点で「案B」として合意済み: 実在の出典リンクを持つnews itemを試合詳細に再掲する)。同時にグロース施策としても、記事読了後の回遊導線として機能する(グロース提案③と同一)。

すでに`/api/v1/stories`(`app/api/v1/stories/route.ts`)には`buildNewsItems()`という、1試合分のnews item(`source_domain`/`source_url`付き)を組み立てるロジックが存在する。ただし現在は**週レンジ内の試合をまとめて返す**設計で、1試合IDを指定して取得する手段がない。

## スコープ

対象:
1. **(tryline / API)** `/api/v1/matches/[id]`(`app/api/v1/matches/[id]/route.ts`)のレスポンス`V1MatchDetail`に`related_news: V1StoryItem[]`フィールドを追加する。中身は`stories/route.ts`の`buildNewsItems()`と同じロジックを、対象試合1件だけに適用したもの(pre/post両フェーズ、`MAX_NEWS_ITEMS_PER_MATCH`は既存定数を流用)
2. **(tryline-mobile / UI)** `MatchDetailScreen.tsx`のイベントタイムラインの下に「関連ニュース」節を追加する。`related_news`が空なら節ごと非表示。各アイテムは出典ドメイン・タイトル・タップで`Linking.openURL(item.source_url)`(`MatchStoriesSection.tsx`の出典リンクパターンを流用)

対象外:
- Match Stories(ホーム画面のストーリー機能)自体の変更
- news item の生成ロジック自体の変更(`buildNewsItems()`を再利用するのみ)
- 関連ニュースの表示件数のパーソナライズ・並び替えロジックの高度化

## データモデル変更

なし(既存の`sourced_facts`テーブルを`buildNewsItems()`経由で参照するのみ)。

## API サーフェス(tryline)

- `GET /api/v1/matches/:id` のレスポンスに `related_news: V1StoryItem[]` を追加
- `lib/api/v1/types.ts` の `V1MatchDetail` に `related_news: V1StoryItem[]` を追加(`V1StoryItem`は既存の`stories`エンドポイントの型をそのまま再利用)
- `app/api/v1/matches/[id]/route.ts` の実装で、`buildNewsItems()`相当のロジックを呼び出す。`stories/route.ts`から関数を共通化(`lib/api/v1/stories.ts`等へ抽出)してもよいし、重複を許容して同route内に持ってもよい(Codexの裁量。ただし将来の修正が2箇所に散らないよう共通化を推奨)
- キャッシュ設定は既存の`/matches/[id]`のものを維持

## UI サーフェス(tryline-mobile)

- `src/matches/MatchDetailScreen.tsx`のイベントタイムライン(`Card`)の下に、新しい`Card`で「関連ニュース」節を追加
- 各アイテムの表示: `source_domain`(見出し的に)・`title`・タップで外部ブラウザを開く。`MatchStoriesSection.tsx`の出典リンクPressable(`accessibilityRole="link"`・`accessibilityLabel`)と同じパターンに揃える
- `match.related_news`が空配列またはundefinedの場合、節ごと描画しない
- ネタバレガードとの関係: news itemの`contains_result`がtrueのもの(試合結果を含む可能性がある)は、`isRevealed`がfalseの間は「関連ニュース」節自体を非表示にする(スコアマスクの抜け穴を作らない)

## 受け入れ条件

1. **(tryline)** `/api/v1/matches/:id`のレスポンスに`related_news`が含まれ、対象試合のnews itemのみが返る(他試合のものが混ざらない)ことを確認するテスト
2. **(tryline)** news itemが存在しない試合では`related_news`が空配列になることを確認するテスト
3. **(tryline-mobile)** `related_news`がある試合詳細で「関連ニュース」節が表示され、タップで`Linking.openURL`が正しいURLで呼ばれることを確認するテスト
4. **(tryline-mobile)** `related_news`が空の試合詳細では節が描画されないことを確認するテスト
5. **(tryline-mobile)** `contains_result`がtrueのnews itemを含む場合、`isRevealed`がfalseの間は関連ニュース節が表示されないことを確認するテスト
6. 両リポジトリで TypeScript strict・lint・test green
7. **Owner 目視**: 実機または Simulator で試合詳細の関連ニュース節の見た目・タップ動作を確認する

## 未解決の質問

- `buildNewsItems()`の共通化(tryline側)は、Codexが既存コードの構造を見て判断する。抽出先のファイル名はCodexの裁量
- 表示件数の上限(現状`MAX_NEWS_ITEMS_PER_MATCH`は3件/フェーズ、pre+post合計で最大6件)が試合詳細の1節としては多すぎないか、実装後にOwnerが目視で判断する
