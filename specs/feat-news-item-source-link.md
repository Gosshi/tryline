# news item の出典をクリック可能なリンクにする

対象リポジトリ: **tryline（Web/API）＋ tryline-mobile（表示）**。実装順は必ず **A(Web) → デプロイ後に B(iOS)**。

## 背景

Owner から「ニュースは出典さえ書けば著作権上問題ないのか」との指摘(2026-07-19)。整理した結果:

- 著作権が保護するのは事実ではなく表現であり、Trylineの安全性は「事実抽出+独自の日本語言い換え+15語以内の引用制限+同一ソース複数引用禁止」という既存の設計不変条件に立脚している。出典表示そのものは免罪符ではなく補完的な要素
- ただし現状の出典表示は `出典: {source_domain}`(例: 「出典: rugbypass.com」)という**タップ不可のプレーンテキスト**のみで、原文への実際のリンク(`source_url`)は `match_sourced_facts` テーブルには保存されているが API・UIのどこにも露出していない(`lib/db/queries/sourced-facts.ts` の select 文に含まれていない)
- 名前だけ出して実際には辿れない状態は出典表示として中途半端。原文へのリンクを追加する方が、送客・情報源との関係維持の観点でも望ましい

## スコープ

対象:
1. Web: `lib/db/queries/sourced-facts.ts` の `getStorySourcedFactsForMatches` の select に `source_url` を追加し、`StorySourcedFact` 型に `sourceUrl: string` を追加する(`match_sourced_facts.source_url` は既存カラムで `not null`)
2. Web: `app/api/v1/stories/route.ts` の `buildNewsItems` が生成する news item に `source_url: fact.sourceUrl` を含める。preview/result/recap 等 news 以外のitemタイプでは既存の `source_domain: null` と同様に `source_url: null` とする
3. Web: `lib/api/v1/types.ts` の `V1StoryItem` に `source_url: string | null` を追加する
4. Mobile: `src/api/types.ts` の `V1StoryItem` 型に同じく `source_url: string | null` を追加する
5. Mobile: `src/stories/MatchStoriesSection.tsx`(552行目付近)の `出典: {item.source_domain}` テキストを、`item.source_url` があればタップ可能な `Pressable` に置き換え、`Linking.openURL(item.source_url)` で外部ブラウザ/システムに遷移させる。既存の外部リンクパターン(`src/matches/BroadcastLinks.tsx`)の `accessibilityRole="link"` + 外部リンクマーク(`↗`)の実装を踏襲する

対象外:
- 外部メディアのOG画像・見出し表示(Phase 3、2026-07-15保留の著作権検証タスクが前提の別件)
- news item以外のstory item type(preview/result/recap)への出典リンク追加(現状これらは`source_domain`自体を持たない)
- web サイト本体(trylinerugby.com のページ)への出典リンク表示。現状 `source_domain`/`source_url` は web の画面には一切表示されておらず(API・OG画像生成のみで使用)、今回もmobileアプリの表示のみを対象とする

## データモデル変更

なし。既存カラム(`match_sourced_facts.source_url`)をAPIに露出するのみ。マイグレーション不要。

## API サーフェス

`V1StoryItem` に `source_url: string | null` を追加(additive、既存クライアントへの後方互換あり)。

## UI サーフェス

- mobile: 出典テキストをタップすると `Linking.openURL()` で外部ブラウザが開く。既存の `BroadcastLinks.tsx` の外部リンク表現(`↗`マーク、`accessibilityRole="link"`)を踏襲し、視覚的に「タップできる」ことが分かるようにする
- 既存の左右タップゾーン(`story-previous-zone`/`story-next-zone`、564-583行目付近)は画面の広い範囲を覆っているため、出典リンクの `Pressable` がその後ろに隠れて反応しない可能性がある。出典リンクの `Pressable` がタップゾーンより優先してタッチを受け取れるよう、配置・z-order・タップゾーンの範囲を確認しながら実装すること(具体的な対処はCodex判断でよいが、実機でタップが機能することを必ず確認する)

## 受け入れ条件

1. `getStorySourcedFactsForMatches` が `source_url` を取得し `StorySourcedFact.sourceUrl` に含めることを確認するテストがある
2. `buildNewsItems` が生成する news item の `source_url` が該当factの`source_url`と一致することを確認するテストがある。news以外のitem typeでは `source_url` が `null` であることを確認する既存テストが壊れていない
3. mobile側で `item.source_url` がある場合に出典テキストが `Pressable` になり、タップで `Linking.openURL(item.source_url)` が呼ばれることを確認するテストがある
4. `source_url` が無い(nullの)news item(理論上発生しない想定だが型上nullableなため)では、出典テキストが従来どおりタップ不可のプレーンテキストとして表示されることを確認するテストがある
5. `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint`(両リポジトリ)が通る
6. **Owner目視確認**: 実機でnews itemの出典タップが正しく外部ブラウザで原文を開くこと、既存の左右タップ送り・スワイプナビゲーションを誤爆しないことを確認する

## 未解決の質問

- なし
