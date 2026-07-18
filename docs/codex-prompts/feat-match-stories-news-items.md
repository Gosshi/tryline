# Codex プロンプト: feat-match-stories-news-items

> **2 部構成・貼る順番厳守**: **プロンプト A（tryline）→ マージ・デプロイ後に → プロンプト B（tryline-mobile）**。

---

## プロンプト A（tryline リポジトリに貼る）

```
specs/feat-match-stories-news-items.md の A（Web 側）を実装してください。

- AGENTS.md の規約に従うこと
- 仕様書と実環境に食い違いがあれば、その場で実装を停止して Owner に確認すること
- スコープ対象外（試合後ニュース・LLM整形・match_newsテーブル・外部メディア）は実装しないこと

### 実装対象

1. app/api/v1/stories: match_sourced_facts からの news item 集約（日本語・high・キックオフ前・
   preview/shared、source_domain 重複排除、最大3件、preview→news(fetched_at昇順)→result→recap 順）。
   候補試合ぶんを match_id IN の1クエリで取得すること
2. lib/api/v1/types.ts: V1StoryItemType に "news" 追加、V1StoryItem に source_domain: string | null 追加
3. app/api/og/route.tsx: parseStoryItemType に "news" 追加（ラベル NEWS / タイトル 試合ニュース / スコア非描画）

### 参考にすべき既存パターン

- 集約・候補絞り込み: app/api/v1/stories/route.ts の isStoryCandidate / buildMatchStories
- sourced_facts クエリ: lib/db/queries/sourced-facts.ts
- 文字整形: lib/text の truncateAtSentenceBoundary（summary 160字）
- og の item 分岐: app/api/og/route.tsx の storyImage（label/title マップ）

### 入出力例

日本×フランス（fact例:「フランス主将デュポンは負傷欠場…リュキュがキャプテンで先発」
rugby-rp.com / high / fetched_at がキックオフ前）:
items = [
  { type: "preview", source_domain: null, ... },
  { id: "<match_id>:news:<fact_id>", type: "news", title: "ニュース｜日本 vs フランス",
    summary: "<fact本文160字>", source_domain: "rugby-rp.com",
    premium_required: false, contains_result: false, ... },
  { type: "result", ... }, { type: "recap", ... }
]

### エッジケース（必ずテストで押さえる）

- 英語のみの fact → 除外 / confidence medium・low → 除外 / fetched_at >= kickoff_at → 除外 /
  content_type='recap' → 除外
- 同一 source_domain の複数 fact → 最新の1件のみ
- 日本語 high fact が4件以上 → 3件に打ち切り
- news 0件の試合 → 従来どおりの items
- sourced_facts クエリが1回のみ発行される（呼び出し回数をテストで検証）
- og item=news: スコア数字なし・text=none/チームカラー背景が従来どおり効く

### 完了の定義

- 仕様書の受け入れ条件 1〜8 を満たす
- tests/api/mobile-api-v1-stories.test.ts / tests/api/og-competition.test.tsx にテスト追加
- pnpm tsc --noEmit / lint / test / build が通る
```

---

## プロンプト B（tryline-mobile リポジトリに貼る。A のマージ・デプロイ後）

```
docs/specs/feat-match-stories-news-items.md の B（iOS 側）を実装してください。

- AGENTS.md の規約に従うこと
- 新規依存パッケージの追加は禁止
- 型は reference/api-types.ts の最新スナップショットに従うこと

### 実装対象

1. src/stories/storyModel.ts: KNOWN_STORY_TYPES に "news" を追加、storyTypeLabel に NEWS を追加
2. ビューアー（src/stories/MatchStoriesSection.tsx）: source_domain 非 null のとき
   published_at の行に「出典: <domain>」を muted で併記

### エッジケース（必ずテストで押さえる）

- news item がビューアーで表示され、既読・未読ドット・自動送りが機能する
- source_domain が null のタイプ（preview 等）では出典行が表示されない
- 旧レスポンス（source_domain フィールドなし）でもクラッシュしない

### 完了の定義

- 仕様書の受け入れ条件 9〜11 を満たす（12 の実機目視は Owner）
- __tests__/match-stories.test.tsx にテスト追加
- typecheck / lint / test が通る
- ビューアーの news 表示スクリーンショットを PR に添付
```

---

## Owner 向け運用メモ

- A マージ後: `lib/api/v1/types.ts` → mobile `reference/api-types.ts` の手動同期を忘れない
- B マージ後: TestFlight 再ビルドで実機確認（受け入れ条件 12 = fact 文がニュースとして読める品質かの目視）
- 日本語 fact が少なく news がほぼ出ない場合は、spec の未解決の質問（medium 緩和 or LLM 整形）の判断へ
