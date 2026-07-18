# feat-match-stories-news-items: sourced_facts ベースの「ニュース」Story Item

対象リポジトリ: **tryline（Web/API/OG）＋ tryline-mobile（iOS・小変更）**。実装順は必ず **A(Web) → デプロイ後に B(iOS)**。

## 背景

マッチストーリーズ Phase 1（preview / result / recap）に対し、Owner から「試合ニュース」枠の要望（2026-07-18 討議で A 案 = 内製ルートを採用）。スコッド発表・負傷・主将交代などの直前情報は、既に週次リフレッシュ（`cron-weekend-preview-refresh.yml`）が **`match_sourced_facts` に出典・確度付きで自動収集している**（実例: 「フランス主将デュポンは負傷欠場、リュキュが主将で先発」rugby-rp.com / confidence high）。これを Story Item として配信する。

外部メディアの OG 画像・本文は一切使わない（著作権検証タスク不要）。fact テキストは取得時に自前パイプラインが LLM で書き直した要約であり、スクレイプ生テキストの再配信には当たらない。

## 方針

- **新規 LLM 呼び出しゼロ・新規テーブルゼロ**。stories API のリクエスト時集約に、決定的なフィルタで news item を追加するだけ
- v1 は**日本語の fact のみ**表示（英語 fact は対象外。ひらがな/カタカナを含むかで判定）
- v1 は**キックオフ前に取得された fact のみ**（`fetched_at < kickoff_at`）。これにより当該試合の結果を含み得ないことが構造的に保証され、`contains_result: false` が安全に成立する（試合後ニュース = POTM・出場停止等は Phase 2）

## スコープ

対象:
- A: `app/api/v1/stories`（news item の集約）、`lib/api/v1/types.ts`（`"news"` タイプ＋`source_domain` フィールド追加）、`app/api/og/route.tsx`（`item=news` 対応）
- B: tryline-mobile の news タイプ対応（既知タイプ登録・出典表示）

対象外:
- 試合後ニュース（結果を含みうる fact）— Phase 2
- fact テキストの LLM 整形・翻訳（表示品質が不足なら次段で検討）
- `match_news` 永続テーブル・編集者の手動ニュース投入 — Phase 3
- 外部メディアの OG 画像・タイトル表示 — Phase 3（着手時は 2026-07-15 保留の著作権検証タスクが前提）

## A: Web（tryline）

### news item の選定ロジック（決定的・LLM なし）

対象試合（既存の 12 件の掲載候補）に対し、`match_sourced_facts` から:

1. `content_type in ('preview','shared')` かつ `confidence = 'high'` かつ **fact に日本語（ひらがな/カタカナ）を含む** かつ `fetched_at < matches.kickoff_at`
2. ソートは `fetched_at` 降順 → **同一 `source_domain` は最初の 1 件のみ**（近接重複対策。実例: rugbypass.com の「南ア10人入替」がほぼ同文で2行ある）
3. 上位 **3 件**まで採用。採用分を `fetched_at` **昇順**（古→新）で items に並べる

- 取得は候補 12 試合ぶんを **match_id IN の1クエリ**で行う（stories の N+1 回避方針を踏襲）
- 該当 0 件なら news item なし（preview 等は従来どおり）

### V1StoryItem への反映

```ts
export type V1StoryItemType = "preview" | "news" | "result" | "recap";

export type V1StoryItem = {
  // 既存フィールドは不変。以下を追加:
  source_domain: string | null; // news のみ値あり、他タイプは null
  ...
};
```

- id: `"<match_id>:news:<fact_id>"`（fact の uuid。既読管理にそのまま使える）
- type: `"news"` / title: `"ニュース｜<ホーム名> vs <アウェイ名>"`（name_ja）
- summary: fact テキストを `truncateAtSentenceBoundary` で全角 160 字に整形（fact は 100〜200 字が典型なので大半はそのまま）
- published_at: `fetched_at` / premium_required: false / contains_result: false
- destination: match（既存と同じ）
- image: `/api/og?type=story&match=<id>&item=news&orientation=...&v=<fetched_at epoch>`
- **試合内の固定順を preview → news（fetched_at 昇順）→ result → recap に更新**（spec feat-match-stories §9 の順序規則を置き換える）
- 1 試合の items 上限は 6（preview 1 + news 3 + result 1 + recap 1）

### OG（`app/api/og/route.tsx`）

- `parseStoryItemType` に `"news"` を追加。ラベル: `NEWS` / タイトル: `試合ニュース`。スコアは描画しない（preview と同じ扱い）
- text=none・チームカラー背景・fallback は既存挙動をそのまま継承（追加実装なし）

### 互換性

- `V1StoryItemType` への `"news"` 追加はクライアント側の「未知タイプ読み飛ばし」規約により**旧アプリを壊さない**（B 未リリースでも安全）
- `source_domain` フィールド追加は additive で後方互換
- マージ後は `lib/api/v1/types.ts` → mobile `reference/api-types.ts` の手動同期（確立運用）

## B: iOS（tryline-mobile）

1. `src/stories/storyModel.ts` の `KNOWN_STORY_TYPES` に `"news"` を追加、`storyTypeLabel` に `NEWS` を追加
2. ビューアーのテキストパネルに**出典表示**を追加: `source_domain` が非 null のとき `出典: <domain>` を published_at の行に併記（小さめ・muted）
3. カードの件数・未読・自動送り・共有は既存ロジックがそのまま効く（追加実装なし。共有 URL は試合ページで従来どおり）

## コスト

追加 LLM 呼び出しゼロ・画像生成コストゼロ（og は既存 story 描画の item ラベル違い）。DB は候補 12 試合に対し 1 クエリ追加（fact テキストは短文で egress 影響軽微）。

## 受け入れ条件

**A（tryline）**
1. 日本語・high・キックオフ前・preview/shared の fact を持つ試合で、news item が preview と result の間に fetched_at 昇順で最大 3 件返る
2. 英語のみの fact / confidence medium・low / `fetched_at >= kickoff_at` / content_type='recap' の fact は**含まれない**（それぞれテストで検証）
3. 同一 source_domain の fact が複数あるとき 1 件のみ採用される
4. news item は `premium_required: false`・`contains_result: false`・`source_domain` に値あり。preview/result/recap の `source_domain` は null
5. 未知タイプ規約の維持: news を含むレスポンスでも既存フィールド構造が不変（既存テスト無変更で通る）
6. sourced_facts の取得が候補試合ぶん 1 クエリで行われる（試合数ぶんのクエリを発行しない）
7. `GET /api/og?...&item=news` が 200 を返し、スコア数字を含まない。`item` 不正値は従来どおり fallback
8. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る

**B（tryline-mobile）**
9. news item がビューアーで表示され、出典（`出典: <domain>`）が表示される。source_domain が null のタイプでは出典行が出ない
10. 既読・未読ドット・自動送りが news にも機能する（既存テストの拡張）
11. 新規依存パッケージなし・`typecheck` / `lint` / `test` が通る
12. **Owner 実機目視**: 実データ（例: 日本×フランスのデュポン欠場 fact）で「ニュースとして読める品質か」を確認する。fact 文の生々しさが目立つ場合は LLM 整形（Phase 2）の判断材料として記録する（機械的条件だけで完了としない）

## 未解決の質問

- 日本語 fact が少ない大会・試合では news が 0 件になりがち（英語 fact が多数派の試合がある）。v1 の実績を見て、(a) confidence medium への緩和 (b) 英語 fact の LLM 翻訳・整形（`MODELS.FAST` 相当・試合単位キャッシュ・コスト見積もり付きの別 spec）のどちらへ進むか Owner 判断
- 試合後ニュース（POTM・出場停止等）は spoiler guard との連動設計（contains_result の判定方法）を含めて Phase 2 spec で扱う
