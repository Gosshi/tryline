# Codex プロンプト: feat-news-item-source-link

> **2 部構成・貼る順番厳守**: **プロンプト A（tryline）→ マージ・デプロイ後に → プロンプト B（tryline-mobile）**。

---

## プロンプト A(tryline リポジトリに貼る)

```
specs/feat-news-item-source-link.md の対象1〜3(Web側)を実装してください。

コンテキスト:
- AGENTS.md の規約に従う
- news item(ストーリー機能)の出典は現状 `出典: {source_domain}` というプレーンテキストのみで、原文へのリンク(`source_url`)が API に露出していない。`match_sourced_facts.source_url` は既存カラム(not null)で、マイグレーションは不要
- `lib/db/queries/sourced-facts.ts` の `getStorySourcedFactsForMatches` が news item 用に sourced_facts を取得する
- `app/api/v1/stories/route.ts` の `buildNewsItems` が news item を組み立てる

やること:
1. `getStorySourcedFactsForMatches` の select に `source_url` を追加し、`StorySourcedFact` 型に `sourceUrl: string` を追加する
2. `buildNewsItems` が生成する news item に `source_url: fact.sourceUrl` を含める。news以外のitem type(preview/result/recap)は既存の `source_domain: null` と同様に `source_url: null` のままにする
3. `lib/api/v1/types.ts` の `V1StoryItem` に `source_url: string | null` を追加する(additive、既存クライアントへの後方互換あり)

処理すべきエッジケース:
- news以外のitem typeでは `source_url` は `null` のまま(既存の `source_domain: null` 分岐と同じ場所に追加する)

完了の定義:
- specs の受け入れ条件1〜2を満たす
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` clean
- 変更ファイル一覧を報告する(想定: `lib/db/queries/sourced-facts.ts`、`app/api/v1/stories/route.ts`、`lib/api/v1/types.ts`、関連テスト)
- マージ後、`lib/api/v1/types.ts` → tryline-mobile `reference/api-types.ts` への手動同期が必要な旨を報告する

要件:
- 「対象外」(外部メディアOG画像・見出し表示、news以外のitem typeへの出典リンク追加、webサイト本体への出典リンク表示)は実装しない
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
```

---

## プロンプト B(tryline-mobile リポジトリに貼る。プロンプト A のマージ・デプロイ後に)

```
tryline/specs/feat-news-item-source-link.md の対象4〜5(Mobile側)を実装してください(仕様書は tryline リポジトリのものを直接参照するか、Ownerが tryline-mobile に必要部分をコピーしたものを参照してください)。

コンテキスト:
- AGENTS.md を読む
- tryline の stories API(`/api/v1/stories`)が `V1StoryItem` に `source_url: string | null` を返すようになった(プロンプトA実装済み・デプロイ済み)。`reference/api-types.ts` を最新化してから着手すること
- `src/stories/MatchStoriesSection.tsx`(552行目付近)に `出典: {item.source_domain}` というタップ不可のプレーンテキストがある
- 外部リンクを開く既存パターンが `src/matches/BroadcastLinks.tsx` にある(`Pressable` + `accessibilityRole="link"` + `Linking.openURL()` + 外部リンクマーク`↗`)

やること:
1. `src/api/types.ts` の `V1StoryItem` に `source_url: string | null` を追加する
2. `MatchStoriesSection.tsx` の出典テキストを、`item.source_url` がある場合は `Pressable` に置き換え、タップで `Linking.openURL(item.source_url)` を呼ぶようにする。`BroadcastLinks.tsx` の実装パターン(外部リンクマーク・accessibilityRole="link")を踏襲する
3. `source_url` が無い場合は従来どおりタップ不可のプレーンテキストのまま表示する

処理すべきエッジケース:
- 出典リンクの `Pressable` が既存の左右タップゾーン(`story-previous-zone`/`story-next-zone`)に隠れてタップが届かない可能性がある。配置・z-order・タップゾーンの範囲を確認し、実機でタップが機能することを確認すること
- 出典リンクをタップした際、ストーリーの一時停止・前後送り・モーダルクローズなど他の挙動を誤爆しないこと

完了の定義:
- specs の受け入れ条件3〜5を満たす(6はOwnerが実機で確認するためスコープ外)
- `pnpm test` / `pnpm lint` / TypeScript チェック clean
- 変更ファイル一覧を報告する(想定: `src/api/types.ts`、`src/stories/MatchStoriesSection.tsx`、関連テスト)

要件:
- 「対象外」は実装しない
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
```
